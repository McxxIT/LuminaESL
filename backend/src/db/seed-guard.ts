/**
 * The seed writes a documented dev-only password for every demo account, so it
 * must never run against a production database. Pure so it can be unit tested.
 */
export function assertSeedAllowed(nodeEnv: string | undefined): void {
  if (nodeEnv === "production") {
    throw new Error(
      "Refusing to seed: NODE_ENV is production. The seed creates dev-only accounts with a shared password.",
    );
  }
}
