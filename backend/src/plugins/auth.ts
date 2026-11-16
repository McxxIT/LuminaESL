import fp from "fastify-plugin";
import { forbidden, unauthorized } from "../lib/errors";
import type { Role } from "../lib/roles";

export default fp(
  async (app) => {
    app.decorate("authenticate", async (request) => {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized("Invalid or expired access token");
      }
    });

    app.decorate("requireRole", (roles: Role | Role[]) => {
      const allowed = Array.isArray(roles) ? roles : [roles];
      return async (request) => {
        try {
          await request.jwtVerify();
        } catch {
          throw unauthorized("Invalid or expired access token");
        }
        if (!allowed.includes(request.user.role)) {
          throw forbidden(
            `This endpoint requires one of: ${allowed.join(", ")}`,
          );
        }
      };
    });
  },
  { name: "auth" },
);
