"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import { useSchool } from "../../lib/hooks/useSchool";
import { recentActivity, type ActivityEntry, type SchoolData, type SchoolUser } from "../../lib/school";
import { updateSchoolSettings } from "../../lib/school/services";
import { isApiDataMode } from "../../lib/auth/mode";
import { captureLocalSnapshot, readPendingImport, type PendingImport } from "../../lib/school";
import {
  buildReceipt,
  importPending,
  previewPendingImport,
  type ImportPreview,
  type ImportRun,
} from "../../lib/school/import/run";
import { formatTimestamp } from "../../lib/scheduling";

type Tab = "rules" | "activity" | "import";

const categories: { key: string; label: string; match: (action: string) => boolean }[] = [
  { key: "all", label: "All activity", match: () => true },
  { key: "lessons", label: "Lessons", match: (action) => action.startsWith("lesson.") || action.startsWith("absence.") },
  { key: "requests", label: "Approvals", match: (action) => action.startsWith("request.") || action.startsWith("slot.") },
  { key: "people", label: "People & credits", match: (action) => /^(manager|teacher|student|user|enrollment|credits)\./.test(action) },
  { key: "curriculum", label: "Curriculum", match: (action) => action.startsWith("course.") },
  { key: "settings", label: "Settings", match: (action) => action.startsWith("settings.") || action.startsWith("school.") },
];

/** "lesson.cancelledByStudent" -> "Lesson cancelled by student" */
function actionLabel(action: string) {
  const [area, verb = ""] = action.split(".");
  const words = `${area} ${verb.replace(/([A-Z])/g, " $1")}`.toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function selectView(data: SchoolData) {
  const users = data.collections.users;
  return {
    settings: data.settings,
    activity: recentActivity(data, 300).map((entry: ActivityEntry) => ({ entry, actor: users[entry.actorId] })),
  };
}

function RulesForm({ user, settings, onNotice }: { user: SchoolUser; settings: ReturnType<typeof selectView>["settings"]; onNotice: (message: string) => void }) {
  const [form, setForm] = useState({
    schoolName: settings.schoolName,
    onTheSpotCancellationHours: String(settings.onTheSpotCancellationHours),
    performanceWindowDays: String(settings.performanceWindowDays),
    studentLateCancellationHours: String(settings.studentLateCancellationHours),
    refundTeacherCancellations: settings.refundTeacherCancellations,
  });
  const [error, setError] = useState("");
  const dirty = form.schoolName !== settings.schoolName
    || Number(form.onTheSpotCancellationHours) !== settings.onTheSpotCancellationHours
    || Number(form.performanceWindowDays) !== settings.performanceWindowDays
    || Number(form.studentLateCancellationHours) !== settings.studentLateCancellationHours
    || form.refundTeacherCancellations !== settings.refundTeacherCancellations;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await updateSchoolSettings(user.id, {
      schoolName: form.schoolName,
      onTheSpotCancellationHours: Number(form.onTheSpotCancellationHours),
      performanceWindowDays: Number(form.performanceWindowDays),
      studentLateCancellationHours: Number(form.studentLateCancellationHours),
      refundTeacherCancellations: form.refundTeacherCancellations,
    });
    if (!result.ok) return setError(result.error);
    setError("");
    onNotice("School settings saved. Scores, warnings, and refunds use the new rules now.");
  }

  return <form className="panel student-panel settings-rules" onSubmit={submit} noValidate>
    <div className="settings-rule">
      <div><strong>School name</strong><p>Shown to everyone in the app.</p></div>
      <input value={form.schoolName} onChange={(event) => setForm({ ...form, schoolName: event.target.value })} aria-label="School name" />
    </div>
    <div className="settings-rule">
      <div><strong>On-the-spot cancellation window</strong><p>A teacher cancellation requested less than this many hours before the lesson costs 10 performance points once approved. Teachers see a warning inside this window.</p></div>
      <label className="settings-number"><input type="number" min="0" max="72" value={form.onTheSpotCancellationHours} onChange={(event) => setForm({ ...form, onTheSpotCancellationHours: event.target.value })} aria-label="On-the-spot window in hours" /><span>hours</span></label>
    </div>
    <div className="settings-rule">
      <div><strong>Performance window</strong><p>Teacher scores count cancellations, absences, and ratings from this many recent days.</p></div>
      <label className="settings-number"><input type="number" min="7" max="180" value={form.performanceWindowDays} onChange={(event) => setForm({ ...form, performanceWindowDays: event.target.value })} aria-label="Performance window in days" /><span>days</span></label>
    </div>
    <div className="settings-rule">
      <div><strong>Student late cancellation</strong><p>Students who cancel closer than this to the start do not get their lesson credit back.</p></div>
      <label className="settings-number"><input type="number" min="0" max="72" value={form.studentLateCancellationHours} onChange={(event) => setForm({ ...form, studentLateCancellationHours: event.target.value })} aria-label="Student late cancellation in hours" /><span>hours</span></label>
    </div>
    <div className="settings-rule">
      <div><strong>Refund teacher cancellations and absences</strong><p>Give the student their credit back when a teacher cancellation is approved or a teacher absence is recorded.</p></div>
      <label className="settings-toggle"><input type="checkbox" checked={form.refundTeacherCancellations} onChange={(event) => setForm({ ...form, refundTeacherCancellations: event.target.checked })} /><span>{form.refundTeacherCancellations ? "On" : "Off"}</span></label>
    </div>
    {error && <p className="form-error" role="alert"><Icon name="x" size={14} /> {error}</p>}
    <div className="settings-actions"><span className="manager-help">{dirty ? "You have unsaved changes." : "All changes saved."}</span><button type="submit" className="primary-button" disabled={!dirty}><Icon name="save" size={15} /> Save settings</button></div>
  </form>;
}

function ImportSummary({ result }: { result: ImportRun | ImportPreview["result"] }) {
  const rows = Object.entries(result.counts).filter(
    ([, count]) => count.created || count.adopted || count.dropped || count.skippedSeed,
  );
  return <>
    <div className="settings-rule">
      <div>
        <strong>Totals</strong>
        <p>{result.totals.created} created · {result.totals.adopted} matched existing records · {result.totals.dropped} dropped · {result.totals.skippedSeed} untouched seed rows skipped</p>
      </div>
    </div>
    {result.pendingUploads > 0 && <div className="settings-rule">
      <div><strong>Attachments to upload</strong><p>{result.pendingUploads} file{result.pendingUploads === 1 ? "" : "s"} will be uploaded when you import.</p></div>
    </div>}
    {rows.map(([name, count]) => <div className="settings-rule" key={name}>
      <div>
        <strong>{name}</strong>
        <p>{count.created} created · {count.adopted} matched · {count.dropped} dropped · {count.skippedSeed} seed</p>
      </div>
    </div>)}
    {result.alreadyImported && <div className="settings-rule">
      <div><strong>Already imported</strong><p>This browser school has been imported before. A second run is refused unless you force it.</p></div>
    </div>}
    {result.warnings.length > 0 && <div className="settings-rule">
      <div>
        <strong>Warnings ({result.warnings.length}{result.warningsTruncated ? "+" : ""})</strong>
        <ul className="manager-help">
          {result.warnings.slice(0, 8).map((warning) => <li key={`${warning.collection}-${warning.localId}`}>{warning.collection}: {warning.message}</li>)}
        </ul>
      </div>
    </div>}
  </>;
}

function ImportPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const [pending, setPending] = useState<PendingImport | null>(() => readPendingImport());
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [run, setRun] = useState<ImportRun | null>(null);
  const [includeSeedRecords, setIncludeSeedRecords] = useState(false);
  const [importSettings, setImportSettings] = useState(false);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState("");

  const options = { includeSeedRecords, importSettings };

  function refreshCapture() {
    setError("");
    setRun(null);
    setPreview(null);
    const captured = captureLocalSnapshot({ force: true });
    setPending(captured ?? readPendingImport());
    onNotice(captured ? "Captured the local school from this browser." : "No local school found in this browser.");
  }

  async function previewCapture() {
    setBusy("preview");
    setError("");
    try {
      setPreview(await previewPendingImport(options));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }

  async function importCapture() {
    setBusy("import");
    setError("");
    try {
      const result = await importPending(options);
      setRun(result);
      setPreview(null);
      setPending(null);
      onNotice(`Imported ${result.totals.created} records into the shared school.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(null);
    }
  }

  function downloadReceipt() {
    if (!run) return;
    const blob = new Blob([buildReceipt(run)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lumina-import-receipt-${run.marker.replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className="panel student-panel settings-rules">
    <div className="settings-rule">
      <div>
        <strong>Local school on this browser</strong>
        {pending
          ? <p>{pending.recordCount} records captured {formatTimestamp(pending.capturedAt)} from a store seeded {formatTimestamp(pending.sourceSeededAt)}.</p>
          : <p>Nothing is waiting to be imported. The local store is kept after an import, so you can capture it again.</p>}
      </div>
      <button type="button" className="cancel-button" onClick={refreshCapture}><Icon name="repeat" size={15} /> Capture again</button>
    </div>

    <div className="settings-rule">
      <div><strong>Untouched demo records</strong><p>Records identical to the demo seed are skipped, so the shared school is not duplicated. Modified records are imported as new rows.</p></div>
      <label className="settings-toggle"><input type="checkbox" checked={includeSeedRecords} onChange={(event) => setIncludeSeedRecords(event.target.checked)} /><span>{includeSeedRecords ? "Import everything" : "Skip seed rows"}</span></label>
    </div>

    <div className="settings-rule">
      <div><strong>School-wide rules</strong><p>Import the settings captured from this browser over the shared ones. Leave this off to keep the rules other people already rely on.</p></div>
      <label className="settings-toggle"><input type="checkbox" checked={importSettings} onChange={(event) => setImportSettings(event.target.checked)} /><span>{importSettings ? "Import settings" : "Keep school settings"}</span></label>
    </div>

    {error && <p className="form-error" role="alert"><Icon name="x" size={14} /> {error}</p>}

    <div className="settings-actions">
      <span className="manager-help">{preview ? "Nothing has been written yet." : "Preview first: it writes nothing."}</span>
      <button type="button" className="cancel-button" onClick={previewCapture} disabled={!pending || busy !== null}>
        <Icon name="search" size={15} /> {busy === "preview" ? "Checking…" : "Preview"}
      </button>
      <button type="button" className="primary-button" onClick={importCapture} disabled={!pending || busy !== null}>
        <Icon name="upload" size={15} /> {busy === "import" ? "Importing…" : "Import into the shared school"}
      </button>
    </div>

    {preview && <div className="settings-rules">
      <h2 className="section-title">Preview</h2>
      <ImportSummary result={preview.result} />
      <p className="manager-help">{preview.diff.identical} of {preview.diff.total} local records are untouched demo data.</p>
    </div>}

    {run && <div className="settings-rules">
      <h2 className="section-title">Imported</h2>
      <ImportSummary result={run} />
      {run.uploadFailures.length > 0 && <p className="form-error" role="alert"><Icon name="x" size={14} /> {run.uploadFailures.length} file(s) could not be uploaded. They are listed in the receipt.</p>}
      <div className="settings-actions">
        <span className="manager-help">{run.archivedKey ? "The captured snapshot is archived in this browser." : "The captured snapshot is cleared."}</span>
        <button type="button" className="cancel-button" onClick={downloadReceipt}><Icon name="download" size={15} /> Download receipt</button>
      </div>
    </div>}
  </section>;
}

export default function AdminSettings({ user, onNotice }: { user: SchoolUser; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>("rules");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const select = useCallback((data: SchoolData) => selectView(data), []);
  const view = useSchool(select);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const match = categories.find((item) => item.key === category)?.match ?? (() => true);
    return view.activity.filter(({ entry, actor }) => match(entry.action) && (!search || `${entry.summary} ${actor?.name ?? ""} ${entry.action}`.toLowerCase().includes(search)));
  }, [view.activity, category, query]);

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">SCHOOL ADMIN</p>
        <h1>School settings</h1>
        <p className="subheading">Rules that apply to every teacher and student, and a record of everything that happens in the school.</p>
      </div>
    </section>

    <div className="student-tabbar settings-tabs" role="tablist" aria-label="School settings">
      <button type="button" role="tab" aria-selected={tab === "rules"} className={`student-tab ${tab === "rules" ? "active" : ""}`} onClick={() => setTab("rules")}>Rules</button>
      <button type="button" role="tab" aria-selected={tab === "activity"} className={`student-tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>Activity log<span>{view.activity.length}</span></button>
      {isApiDataMode() && <button type="button" role="tab" aria-selected={tab === "import"} className={`student-tab ${tab === "import" ? "active" : ""}`} onClick={() => setTab("import")}>Import local data</button>}
    </div>

    {/* Remount the form when saved settings change so it shows the stored values. */}
    {tab === "rules" && <RulesForm key={JSON.stringify(view.settings)} user={user} settings={view.settings} onNotice={onNotice} />}
    {isApiDataMode() && tab === "import" && <ImportPanel onNotice={onNotice} />}

    {tab === "activity" && <section className="panel student-panel">
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or details…" aria-label="Search activity" /></label>
        <label className="student-select"><Icon name="filter" size={15} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Activity type">{categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <span className="student-filter-count">Showing {rows.length} of {view.activity.length}</span>
      </div>
      <div className="activity-list">
        {rows.map(({ entry, actor }) => <div className="activity-row" key={entry.id}>
          <time>{formatTimestamp(entry.createdAt)}</time>
          <div><strong>{actionLabel(entry.action)}</strong><small>{entry.summary}</small></div>
          <span className="activity-actor">{actor ? `${actor.name} · ${actor.role}` : "System"}</span>
        </div>)}
        {rows.length === 0 && <div className="student-empty-inline"><Icon name="clock" /><p>No activity matches.</p></div>}
      </div>
    </section>}
  </div>;
}
