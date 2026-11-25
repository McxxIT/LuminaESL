import type { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  attachments,
  lessonLibraryItems,
  lessons,
  libraryItems,
  requests,
  users,
  type LessonLibraryItem,
  type LibraryItem,
} from "../db/schema.js";
import { logActivity } from "../lib/activity.js";
import {
  AppError,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
} from "../lib/errors.js";
import { managerOwnsTeacher } from "../lib/scope.js";

/**
 * Curriculum Library: one global, school-wide library of reusable files.
 *
 * - Create: admin and managers, from an attachment they uploaded (admin: any upload)
 *   that is not request evidence and does not already back an item.
 * - Edit/archive/unarchive: the creator or an admin. The file and creator never change.
 * - Attach/detach to a lesson: admin any lesson; a manager only lessons of a teacher on
 *   their team. Teachers and students never attach.
 *
 * Reads go through `GET /school/bootstrap` (role-filtered); downloads through
 * `GET /uploads/:id/download` (`canAccessAttachment`).
 */

const STAFF = ["admin", "manager"] as const;

const idParams = z.object({ id: z.string().uuid() });
const linkParams = z.object({
  id: z.string().uuid(),
  libraryItemId: z.string().uuid(),
});

const titleSchema = z.string().trim().min(1).max(200);
const categorySchema = z.string().trim().min(1).max(200);
const levelSchema = z.string().trim().max(50);
const descriptionSchema = z.string().trim().max(2000);
const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(20);

const createSchema = z
  .object({
    attachmentId: z.string().uuid(),
    title: titleSchema,
    category: categorySchema,
    level: levelSchema.optional(),
    description: descriptionSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict();

const updateSchema = z
  .object({
    title: titleSchema.optional(),
    category: categorySchema.optional(),
    level: levelSchema.optional(),
    description: descriptionSchema.optional(),
    tags: tagsSchema.optional(),
    status: z.enum(["published", "archived"]).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

const attachSchema = z.object({ libraryItemId: z.string().uuid() }).strict();

const emptyToNull = (value: string | undefined) =>
  value === undefined ? undefined : value === "" ? null : value;

const uniqueTags = (tags: string[] | undefined) =>
  tags === undefined ? undefined : [...new Set(tags)];

/** Strict status mapper: the DB CHECK allows only these values; anything else is corrupt data. */
export function libraryStatus(value: string): "published" | "archived" {
  if (value === "published" || value === "archived") return value;
  throw new Error(`Invalid library item status: ${value}`);
}

/**
 * API/bootstrap shape of a library item (matches `LibraryItem` in the frontend types).
 * `createdByName` is emitted only when the caller passes it (staff views).
 */
export function libraryItemRecord(row: LibraryItem, creatorName?: string) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    level: row.level ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags,
    attachmentId: row.attachmentId,
    createdBy: row.createdBy,
    ...(creatorName === undefined ? {} : { createdByName: creatorName }),
    status: libraryStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** API/bootstrap shape of a lesson link; `id` is derived, never stored. */
export function lessonLibraryLinkRecord(row: LessonLibraryItem) {
  return {
    id: `${row.lessonId}:${row.libraryItemId}`,
    lessonId: row.lessonId,
    libraryItemId: row.libraryItemId,
    attachedBy: row.attachedBy,
    attachedAt: row.attachedAt.toISOString(),
  };
}

export const libraryRoutes: FastifyPluginAsync = async (app) => {
  /** Creator display name for staff responses (create/PATCH are staff-only). */
  const creatorNameOf = async (userId: string) => {
    const [row] = await app.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.name;
  };

  /** Lesson lookup plus the attach/detach ownership rule (admin any; manager own team). */
  const loadOwnedLesson = async (
    actor: { sub: string; role: string },
    lessonId: string,
  ) => {
    const [lesson] = await app.db
      .select({
        id: lessons.id,
        title: lessons.title,
        teacherId: lessons.teacherId,
        status: lessons.status,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    if (!lesson) throw notFound("Lesson not found");
    if (
      actor.role !== "admin" &&
      !(await managerOwnsTeacher(app.db, actor.sub, lesson.teacherId))
    ) {
      throw forbidden("You can only manage materials on your team's lessons");
    }
    return lesson;
  };

  app.post(
    "/library",
    { preHandler: app.requireRole([...STAFF]) },
    async (request, reply) => {
      const actor = request.user;
      const body = createSchema.parse(request.body);

      const [attachment] = await app.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, body.attachmentId))
        .limit(1);
      if (!attachment) throw notFound("Attachment not found");
      if (actor.role !== "admin" && attachment.uploadedBy !== actor.sub) {
        throw forbidden("You can only add files you uploaded to the library");
      }

      const [evidence] = await app.db
        .select({ id: requests.id })
        .from(requests)
        .where(eq(requests.attachmentId, attachment.id))
        .limit(1);
      if (evidence) {
        throw new AppError(
          422,
          "ATTACHMENT_NOT_ELIGIBLE",
          "Request evidence cannot be added to the library",
        );
      }

      const [existing] = await app.db
        .select({ id: libraryItems.id })
        .from(libraryItems)
        .where(eq(libraryItems.attachmentId, attachment.id))
        .limit(1);
      if (existing) throw conflict("This file is already in the library");

      let created: LibraryItem;
      try {
        created = await app.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(libraryItems)
            .values({
              title: body.title,
              category: body.category,
              level: emptyToNull(body.level) ?? null,
              description: emptyToNull(body.description) ?? null,
              tags: uniqueTags(body.tags) ?? [],
              attachmentId: attachment.id,
              createdBy: actor.sub,
            })
            .returning();
          if (!row) throw new Error("Library item insert returned no row");
          await logActivity(tx, {
            actorId: actor.sub,
            action: "library.created",
            targetType: "libraryItem",
            targetId: row.id,
            summary: `Added "${row.title}" (${attachment.name}) to the library`,
          });
          return row;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("This file is already in the library");
        }
        throw error;
      }

      reply.code(201);
      return libraryItemRecord(created, await creatorNameOf(created.createdBy));
    },
  );

  app.patch(
    "/library/:id",
    { preHandler: app.requireRole([...STAFF]) },
    async (request) => {
      const actor = request.user;
      const { id } = idParams.parse(request.params);
      const body = updateSchema.parse(request.body);

      const [item] = await app.db
        .select()
        .from(libraryItems)
        .where(eq(libraryItems.id, id))
        .limit(1);
      if (!item) throw notFound("Library item not found");
      if (actor.role !== "admin" && item.createdBy !== actor.sub) {
        throw forbidden("Only the creator or an admin can edit this item");
      }

      const archiving = body.status === "archived" && item.status !== "archived";

      const updated = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .update(libraryItems)
          .set({
            ...(body.title !== undefined && { title: body.title }),
            ...(body.category !== undefined && { category: body.category }),
            ...(body.level !== undefined && { level: emptyToNull(body.level) }),
            ...(body.description !== undefined && {
              description: emptyToNull(body.description),
            }),
            ...(body.tags !== undefined && { tags: uniqueTags(body.tags) }),
            ...(body.status !== undefined && { status: body.status }),
            updatedAt: new Date(),
          })
          .where(eq(libraryItems.id, id))
          .returning();
        if (!row) throw notFound("Library item not found");
        await logActivity(tx, {
          actorId: actor.sub,
          action: archiving ? "library.archived" : "library.updated",
          targetType: "libraryItem",
          targetId: row.id,
          summary: archiving
            ? `Archived library item "${row.title}"`
            : `Updated library item "${row.title}"`,
        });
        return row;
      });

      return libraryItemRecord(updated, await creatorNameOf(updated.createdBy));
    },
  );

  app.post(
    "/lessons/:id/library-items",
    { preHandler: app.requireRole([...STAFF]) },
    async (request) => {
      const actor = request.user;
      const { id } = idParams.parse(request.params);
      const body = attachSchema.parse(request.body);

      const lesson = await loadOwnedLesson(actor, id);

      const [item] = await app.db
        .select()
        .from(libraryItems)
        .where(eq(libraryItems.id, body.libraryItemId))
        .limit(1);
      if (!item) throw notFound("Library item not found");
      if (item.status !== "published") {
        throw new AppError(
          422,
          "ITEM_ARCHIVED",
          "Archived library items cannot be attached",
        );
      }
      if (lesson.status !== "scheduled" && lesson.status !== "live") {
        throw new AppError(
          422,
          "LESSON_NOT_ATTACHABLE",
          "Materials can only be attached to scheduled or live lessons",
        );
      }

      const link = await app.db.transaction(async (tx) => {
        // A concurrent detach can remove the existing link between the insert and the
        // follow-up select (READ COMMITTED). Retry once, then answer 409, never 500.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const [inserted] = await tx
            .insert(lessonLibraryItems)
            .values({
              lessonId: lesson.id,
              libraryItemId: item.id,
              attachedBy: actor.sub,
            })
            .onConflictDoNothing()
            .returning();
          if (inserted) {
            await logActivity(tx, {
              actorId: actor.sub,
              action: "lesson.libraryAttached",
              targetType: "lesson",
              targetId: lesson.id,
              summary: `Attached "${item.title}" to lesson "${lesson.title}"`,
            });
            return inserted;
          }
          const [existing] = await tx
            .select()
            .from(lessonLibraryItems)
            .where(
              and(
                eq(lessonLibraryItems.lessonId, lesson.id),
                eq(lessonLibraryItems.libraryItemId, item.id),
              ),
            )
            .limit(1);
          if (existing) return existing;
        }
        throw conflict("The library link changed while attaching; try again");
      });

      return lessonLibraryLinkRecord(link);
    },
  );

  app.delete(
    "/lessons/:id/library-items/:libraryItemId",
    { preHandler: app.requireRole([...STAFF]) },
    async (request, reply) => {
      const actor = request.user;
      const { id, libraryItemId } = linkParams.parse(request.params);

      const lesson = await loadOwnedLesson(actor, id);

      const [item] = await app.db
        .select({ id: libraryItems.id, title: libraryItems.title })
        .from(libraryItems)
        .where(eq(libraryItems.id, libraryItemId))
        .limit(1);
      if (!item) throw notFound("Library item not found");

      await app.db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(lessonLibraryItems)
          .where(
            and(
              eq(lessonLibraryItems.lessonId, lesson.id),
              eq(lessonLibraryItems.libraryItemId, item.id),
            ),
          )
          .returning();
        if (!removed) return;
        await logActivity(tx, {
          actorId: actor.sub,
          action: "lesson.libraryDetached",
          targetType: "lesson",
          targetId: lesson.id,
          summary: `Removed "${item.title}" from lesson "${lesson.title}"`,
        });
      });

      return reply.code(204).send();
    },
  );
};
