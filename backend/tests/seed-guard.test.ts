import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "../src/db/seed-guard";

describe("seed guard", () => {
  it("should refuse to seed when NODE_ENV is production", () => {
    expect(() => assertSeedAllowed("production")).toThrow(/NODE_ENV/);
  });

  it("allows development, test and an unset NODE_ENV", () => {
    expect(() => assertSeedAllowed("development")).not.toThrow();
    expect(() => assertSeedAllowed("test")).not.toThrow();
    expect(() => assertSeedAllowed(undefined)).not.toThrow();
  });
});
