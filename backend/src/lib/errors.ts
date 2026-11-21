export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Authentication required"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have access to this resource"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "CONFLICT", message);
}

export function unprocessable(message: string, details?: unknown): AppError {
  return new AppError(422, "UNPROCESSABLE_ENTITY", message, details);
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
