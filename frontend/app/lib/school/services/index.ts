/**
 * Services: the only code that changes school data. Each takes the acting user's id, checks
 * permissions and business rules, writes in one transaction, and returns a `ServiceResult`.
 */
export * from "./result";
export { LESSON_CREDIT_HOURS } from "./common";
export * from "./bookings";
export * from "./teaching";
export * from "./approvals";
export * from "./credits";
export * from "./people";
export * from "./curriculum";
export * from "./uploads";
export * from "./quality";
export * from "./homework";
export * from "./profile";
export * from "./library";
