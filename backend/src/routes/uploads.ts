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

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw badRequest("No file provided");

      const buffer = await file.toBuffer();
      if (buffer.length === 0) throw badRequest("Uploaded file is empty");

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
