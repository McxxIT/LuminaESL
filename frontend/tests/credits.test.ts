import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { creditBalance, getSchoolSnapshot } from "@/app/lib/school";
import { purchaseCredits } from "@/app/lib/school/services/credits";
import { adjustCredits } from "@/app/lib/school/services/people";
import { freezeTime, freshSchool, sync } from "./helpers/school";

const STUDENT = "student-ava";
const denied = { ok: false, error: "You don't have permission to do that." };
const balance = () => creditBalance(getSchoolSnapshot(), STUDENT);

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("balance selector", () => {
  test("sums the seeded ledger", () => {
    expect(creditBalance(getSchoolSnapshot(), "student-mia")).toBe(24);
    expect(balance()).toBe(10);
  });
});

describe("purchase (demo mode)", () => {
  test("a student tops up their own balance", () => {
    expect(sync(purchaseCredits(STUDENT, 5, 60))).toEqual({ ok: true, value: undefined });
    expect(balance()).toBe(15);
  });

  test("a package must have credits", () => {
    expect(sync(purchaseCredits(STUDENT, 0, 0))).toEqual({ ok: false, error: "Choose a credit package." });
  });

  test("staff cannot purchase", () => {
    expect(sync(purchaseCredits("manager-priya", 5, 60))).toEqual(denied);
  });
});

describe("staff adjustment", () => {
  test("adds and removes credits with a reason", () => {
    expect(sync(adjustCredits("manager-priya", STUDENT, 2.5, "Goodwill")).ok).toBe(true);
    expect(sync(adjustCredits("manager-priya", STUDENT, -1, "Correction")).ok).toBe(true);
    expect(balance()).toBe(11.5);
  });

  test("refuses to overdraw the balance", () => {
    expect(sync(adjustCredits("manager-priya", STUDENT, -11, "Too much"))).toEqual({ ok: false, error: "Not enough lesson credits. Top up in Billing to book this lesson." });
    expect(balance()).toBe(10);
  });

  test("speaks in credits: zero-amount message and activity summary", () => {
    expect(sync(adjustCredits("manager-priya", STUDENT, 0, "Nothing"))).toEqual({ ok: false, error: "Enter how many credits to add or remove." });
    expect(sync(adjustCredits("manager-priya", STUDENT, 2, "Goodwill")).ok).toBe(true);
    const summaries = Object.values(getSchoolSnapshot().collections.activity)
      .filter((entry) => entry.action === "credits.adjusted" && entry.targetId === STUDENT)
      .map((entry) => entry.summary);
    expect(summaries).toEqual(["+2 credits: Goodwill"]);
  });

  test("requires a reason", () => {
    expect(sync(adjustCredits("manager-priya", STUDENT, 1, "  "))).toEqual({ ok: false, error: "Add a reason for the adjustment." });
  });

  test("only the admin or the student's own manager may adjust", () => {
    expect(sync(adjustCredits("manager-marco", STUDENT, 1, "Gift"))).toEqual(denied);
    expect(sync(adjustCredits("admin-jamie", STUDENT, 1, "Gift")).ok).toBe(true);
  });
});
