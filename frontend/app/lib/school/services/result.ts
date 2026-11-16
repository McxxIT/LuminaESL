import { PermissionError } from "../permissions";

/** Every service returns this instead of throwing, so screens can show `error` in a toast. */
export type ServiceResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): ServiceResult<T>;
export function ok(): ServiceResult<void>;
export function ok<T>(value?: T): ServiceResult<T | undefined> {
  return { ok: true, value };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Thrown inside an `updateSchool` mutator to abort the transaction with a user-facing message. */
export class ServiceError extends Error {}

/** Runs a service body, converting rule and permission failures into a `ServiceResult`. */
export function run<T>(body: () => T): ServiceResult<T> {
  try {
    return { ok: true, value: body() };
  } catch (error) {
    if (error instanceof ServiceError) return fail(error.message);
    if (error instanceof PermissionError) return fail("You don't have permission to do that.");
    throw error;
  }
}
