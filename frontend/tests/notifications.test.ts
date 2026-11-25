import { describe, expect, test } from "vitest";
import { activityNotification, type ActivityEntry, type SchoolUser } from "@/app/lib/school";

type UserRole = SchoolUser["role"];

function entry(action: string): ActivityEntry {
  return { id: "a1", actorId: "admin-jamie", action, targetType: "libraryItem", targetId: "lib-1", summary: "Added an item", createdAt: "2026-03-02T09:00:00.000Z" };
}

describe("library activity notifications", () => {
  const expected: [UserRole, string][] = [
    ["admin", "Curriculum"],
    ["manager", "Curriculum"],
    ["teacher", "Lessons"],
    ["student", "Lessons"],
  ];

  for (const action of ["library.created", "library.updated", "library.archived"]) {
    test(`${action} opens Curriculum for staff and Lessons for teachers and students`, () => {
      for (const [role, nav] of expected) {
        const notification = activityNotification(entry(action), role);
        expect(notification.nav, `${action} as ${role}`).toBe(nav);
        expect(notification.category).toBe("plans");
      }
    });
  }
});
