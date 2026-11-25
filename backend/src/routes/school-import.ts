import type { FastifyPluginAsync } from "fastify";
import { logActivity } from "../lib/activity.js";
import { conflict } from "../lib/errors.js";
import {
  applyImportPlan,
  buildImportPlan,
  findImportMarker,
  importPayloadSchema,
  loadExistingSchool,
  type ImportPlan,
} from "../lib/school-import.js";

/**
 * One-time import of a browser school store into Postgres (D2).
 *
 * Admin only: it writes history straight into every table, so it is treated like
 * `POST /users` and `PATCH /settings` rather than as a normal user action.
 *
 * `preview` runs the same planner as the real import and writes nothing. The body
 * is metadata only (attachment bytes go through `POST /uploads` first), but a whole
 * school can exceed Fastify's 1 MiB default, so both routes carry their own limit.
 */

const BODY_LIMIT = 8 * 1024 * 1024;

function respond(plan: ImportPlan, dryRun: boolean, alreadyImported: boolean) {
  return {
    dryRun,
    marker: plan.marker,
    alreadyImported,
    settingsApplied: Boolean(plan.settings),
    pendingUploads: plan.pendingUploads,
    totals: plan.totals,
    counts: plan.counts,
    idMap: plan.idMap,
    createdIds: plan.createdIds,
    warnings: plan.warnings,
    warningsTruncated: plan.warningsTruncated,
  };
}

export const schoolImportRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/import/preview",
    { preHandler: app.requireRole("admin"), bodyLimit: BODY_LIMIT },
    async (request) => {
      const payload = importPayloadSchema.parse(request.body);
      const existing = await loadExistingSchool(app.db);
      const plan = buildImportPlan(payload, existing, {
        actorId: request.user.sub,
        dryRun: true,
      });
      const alreadyImported = await findImportMarker(app.db, plan.marker);
      return respond(plan, true, alreadyImported);
    },
  );

  app.post(
    "/import",
    { preHandler: app.requireRole("admin"), bodyLimit: BODY_LIMIT },
    async (request, reply) => {
      const payload = importPayloadSchema.parse(request.body);

      const plan = await app.db.transaction(async (tx) => {
        if (!payload.options.force && (await findImportMarker(tx, payload.source.seededAt))) {
          throw conflict("This browser school was already imported. Pass force to import it again.");
        }
        const existing = await loadExistingSchool(tx);
        const built = buildImportPlan(payload, existing, {
          actorId: request.user.sub,
          dryRun: false,
        });
        await applyImportPlan(tx, built);
        await logActivity(tx, {
          actorId: request.user.sub,
          action: "school.imported",
          targetType: "school",
          targetId: built.marker,
          summary: `Imported ${built.totals.created} records from a browser school (${built.totals.adopted} matched existing rows, ${built.totals.dropped} dropped, ${built.totals.skippedSeed} untouched seed rows skipped).`,
        });
        return built;
      });

      reply.status(201);
      return respond(plan, false, false);
    },
  );
};
