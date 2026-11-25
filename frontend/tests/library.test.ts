import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSchoolSnapshot } from "@/app/lib/school";
import { attachLibraryItem, detachLibraryItem, lessonLibraryLinkId, setLibraryItemStatus, updateLibraryItem } from "@/app/lib/school/services/library";
import { activityCount, addLibraryItem, bookAs, setLessonStatus } from "./helpers/fixtures";
import { dayFrom, freezeTime, freshSchool, sync, TEST_NOW } from "./helpers/school";

// The local createLibraryItem happy path needs FileReader + IndexedDB and is a documented
// known gap at the unit layer (covered by the demo and API e2e specs).

const ADMIN = "admin-jamie";
const PRIYA = "manager-priya"; // manages teacher-alex
const MARCO = "manager-marco"; // does not
const denied = { ok: false, error: "You don't have permission to do that." };

function lesson() {
  return bookAs("student-ava", "teacher-alex", dayFrom(TEST_NOW, 3), "10:00");
}

beforeEach(() => {
  freezeTime();
  freshSchool();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attach and detach", () => {
  test("attaching is idempotent: one link and one activity row", () => {
    const item = addLibraryItem("lib-1", PRIYA);
    const target = lesson();
    expect(sync(attachLibraryItem(PRIYA, target.id, item.id))).toEqual({ ok: true, value: undefined });
    expect(sync(attachLibraryItem(PRIYA, target.id, item.id)).ok).toBe(true);
    const links = Object.values(getSchoolSnapshot().collections.lessonLibraryItems).filter((link) => link.lessonId === target.id);
    expect(links.map((link) => link.id)).toEqual([lessonLibraryLinkId(target.id, item.id)]);
    expect(activityCount("lesson.libraryAttached", target.id)).toBe(1);
  });

  test("an archived item cannot be attached", () => {
    const item = addLibraryItem("lib-2", PRIYA, "archived");
    expect(sync(attachLibraryItem(ADMIN, lesson().id, item.id))).toEqual({ ok: false, error: "Archived library items cannot be attached." });
  });

  test("a cancelled lesson cannot receive materials", () => {
    const item = addLibraryItem("lib-3", PRIYA);
    const target = lesson();
    setLessonStatus(target.id, "cancelled");
    expect(sync(attachLibraryItem(ADMIN, target.id, item.id))).toEqual({ ok: false, error: "Materials can only be attached to scheduled or live lessons." });
  });

  test("teachers, students and other teams' managers cannot attach", () => {
    const item = addLibraryItem("lib-4", PRIYA);
    const target = lesson();
    expect(sync(attachLibraryItem("teacher-alex", target.id, item.id))).toEqual(denied);
    expect(sync(attachLibraryItem("student-ava", target.id, item.id))).toEqual(denied);
    expect(sync(attachLibraryItem(MARCO, target.id, item.id))).toEqual(denied);
  });

  test("detaching a missing link is a no-op without an activity row", () => {
    const item = addLibraryItem("lib-5", PRIYA);
    const target = lesson();
    expect(sync(detachLibraryItem(ADMIN, target.id, item.id))).toEqual({ ok: true, value: undefined });
    expect(activityCount("lesson.libraryDetached", target.id)).toBe(0);
    expect(sync(attachLibraryItem(ADMIN, target.id, item.id)).ok).toBe(true);
    expect(sync(detachLibraryItem(ADMIN, target.id, item.id)).ok).toBe(true);
    expect(activityCount("lesson.libraryDetached", target.id)).toBe(1);
  });
});

describe("edit and archive", () => {
  const input = { title: "Renamed", category: "Speaking" };

  test("the creating manager edits their item; another manager cannot", () => {
    const item = addLibraryItem("lib-6", PRIYA);
    expect(sync(updateLibraryItem(MARCO, item.id, input))).toEqual(denied);
    expect(sync(updateLibraryItem(PRIYA, item.id, input)).ok).toBe(true);
    expect(getSchoolSnapshot().collections.libraryItems[item.id]?.title).toBe("Renamed");
  });

  test("the admin archives any item and the archive is logged once", () => {
    const item = addLibraryItem("lib-7", MARCO);
    expect(sync(setLibraryItemStatus(PRIYA, item.id, "archived"))).toEqual(denied);
    expect(sync(setLibraryItemStatus(ADMIN, item.id, "archived")).ok).toBe(true);
    expect(getSchoolSnapshot().collections.libraryItems[item.id]?.status).toBe("archived");
    expect(activityCount("library.archived", item.id)).toBe(1);
  });

  test("teachers cannot edit library items", () => {
    const item = addLibraryItem("lib-8", PRIYA);
    expect(sync(updateLibraryItem("teacher-alex", item.id, input))).toEqual(denied);
  });
});
