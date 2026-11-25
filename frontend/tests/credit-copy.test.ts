import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * Credit balances and quantities read "credits" in the UI, never "hours"/"hrs". The data field
 * stays `hours` (API, ledger, packages); only rendered text is checked here. Genuine time
 * wording inside these files is allowlisted by exact text, with a reason.
 */
const GUARDED_FILES = [
  "app/components/LuminaApp.tsx",
  "app/components/manager/ManagerSchedule.tsx",
  "app/components/manager/ManagerStudents.tsx",
  "app/components/manager/PeopleForms.tsx",
  "app/components/student/StudentBilling.tsx",
  "app/components/student/StudentLessons.tsx",
  "app/components/student/StudentOverview.tsx",
  "app/lib/school/notifications.ts",
  "app/lib/school/services/people.ts",
  "app/lib/data.ts",
];

type AllowEntry = { file: string; text: string; reason: string };

const ALLOWLIST: AllowEntry[] = [
  { file: "app/components/student/StudentLessons.tsx", text: "Lesson cancelled. Cancellations within 24 hours of the start are not refunded.", reason: "cancellation window in hours" },
  { file: "app/components/student/StudentLessons.tsx", text: "Cancel at least 4 hours before the lesson to keep your credit. This demo always returns the credit.", reason: "cancellation window in hours" },
  { file: "app/components/student/StudentOverview.tsx", text: "Hours", reason: "next-lesson countdown unit" },
  { file: "app/lib/data.ts", text: "Due in 5 hours", reason: "seed homework due label (time)" },
];

const HOURS_WORDING = /\bhrs?\b|\bhours?\b/i;

/** Every piece of literal text in the file: string literals, template text, and JSX text. */
function textSegments(relativePath: string): string[] {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const segments: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      segments.push(node.text);
    } else if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text) segments.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

describe("credit wording", () => {
  test("no credit-meaning text says hrs/hours outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of GUARDED_FILES) {
      const allowed = ALLOWLIST.filter((entry) => entry.file === file).map((entry) => entry.text);
      for (const segment of textSegments(file)) {
        if (HOURS_WORDING.test(segment) && !allowed.includes(segment)) offenders.push(`${file}: "${segment}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every allowlist entry still exists (a stale entry fails)", () => {
    const stale = ALLOWLIST.filter((entry) => !textSegments(entry.file).includes(entry.text));
    expect(stale).toEqual([]);
  });

  test("the reviewed credit labels are in place", () => {
    const expected: [string, string][] = [
      ["app/components/student/StudentBilling.tsx", "Credits remaining"],
      ["app/components/student/StudentBilling.tsx", "Credits:"],
      ["app/components/student/StudentBilling.tsx", "Add lesson credits"],
      ["app/components/manager/PeopleForms.tsx", "Starting credits"],
      ["app/lib/school/services/people.ts", "Enter how many credits to add or remove."],
      ["app/lib/data.ts", "10 lesson credits"],
    ];
    const missing = expected.filter(([file, text]) => !textSegments(file).some((segment) => segment.includes(text)));
    expect(missing).toEqual([]);
  });
});
