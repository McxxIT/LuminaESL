import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { attachments } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";

const idParams = z.object({ id: z.string().uuid() });

/** Matches the frontend accept rule (`services/uploads.ts`). */
const ACCEPTED_TYPES =
  /^(application\/pdf|image\/|application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-powerpoint))/;

/** Matches the frontend `MAX_UPLOAD_BYTES` (5 MB); the multipart limit in `app.ts` is the backstop. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw badRequest("No file provided");
      if (!ACCEPTED_TYPES.test(file.mimetype)) {
        throw badRequest("Upload a PDF, image, Word, or PowerPoint file.");
      }

      const buffer = await file.toBuffer();
      if (buffer.length === 0) throw badRequest("Uploaded file is empty");
      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw badRequest("Files must be 5 MB or smaller.");
      }

      const directory = resolve(app.config.UPLOAD_DIR);
      await mkdir(directory, { recursive: true });

      const storageKey = `${randomUUID()}${extname(file.filename)}`;
      await writeFile(join(directory, storageKey), buffer);

      const [attachment] = await app.db
        .insert(attachments)
        .values({
          name: file.filename,
          type: file.mimetype,
          size: buffer.length,
          storageKey,
          uploadedBy: request.user.sub,
        })
        .returning();
      if (!attachment) throw new Error("Failed to store attachment");

      reply.status(201);
      return attachment;
    },
  );

  app.get(
    "/:id",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const [attachment] = await app.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);
      if (!attachment) throw notFound("Attachment not found");
      return attachment;
    },
  );

  app.get(
    "/:id/download",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const [attachment] = await app.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);
      if (!attachment) throw notFound("Attachment not found");

      const filePath = join(
        resolve(app.config.UPLOAD_DIR),
        attachment.storageKey,
      );
      try {
        await access(filePath);
      } catch {
        throw notFound("Attachment file is missing from storage");
      }

      const safeName = attachment.name.replace(/["\r\n]/g, "");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${safeName}"`,
      );

      return reply
        .type(attachment.type)
        .send(createReadStream(filePath));
    },
  );
};
