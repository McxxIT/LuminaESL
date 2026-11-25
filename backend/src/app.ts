import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "./config/env";
import { corsOrigins } from "./config/env";
import { AppError } from "./lib/errors";
import { createMailer, type Mailer } from "./lib/mailer";
import authPlugin from "./plugins/auth";
import dbPlugin from "./plugins/db";
import { apiRoutes } from "./routes";

export type BuildAppOptions = {
  env: Env;
  /** Injected mail transport (tests, smoke); defaults to `createMailer(env)`. */
  mailer?: Mailer;
};

export async function buildApp({ env, mailer }: BuildAppOptions) {
  const logger =
    env.NODE_ENV === "test"
      ? false
      : env.NODE_ENV === "development"
        ? {
            level: env.LOG_LEVEL,
            transport: {
              target: "pino-pretty",
              options: { translateTime: "SYS:standard", ignore: "pid,hostname" },
            },
          }
        : { level: env.LOG_LEVEL };

  const app = Fastify({ logger, trustProxy: true });

  app.decorate("config", env);
  app.decorate("mailer", mailer ?? createMailer(env, app.log));

  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.issues,
          },
        });
      }

      if (error.validation) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request payload",
            details: error.validation,
          },
        });
      }

      if (
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code ?? "REQUEST_ERROR",
            message: error.message,
          },
        });
      }

      request.log.error(error);
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message:
            env.NODE_ENV === "production"
              ? "Something went wrong"
              : error.message,
        },
      });
    },
  );

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  await app.register(cors, {
    origin: corsOrigins(env),
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
  });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  await app.register(dbPlugin, { connectionString: env.DATABASE_URL });
  await app.register(authPlugin);

  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  await app.register(apiRoutes, { prefix: "/api/v1" });

  return app;
}
