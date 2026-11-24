import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { preHandlerHookHandler } from "fastify";
import type * as schema from "../db/schema";
import type { Env } from "../config/env";
import type { Mailer } from "../lib/mailer";
import type { Role } from "../lib/roles";

export type TokenPayload = {
  sub: string;
  role: Role;
  email: string;
};

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
    mailer: Mailer;
    db: PostgresJsDatabase<typeof schema>;
    authenticate: preHandlerHookHandler;
    requireRole: (
      roles: Role | Role[],
    ) => preHandlerHookHandler;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}
