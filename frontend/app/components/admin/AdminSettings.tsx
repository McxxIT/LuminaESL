"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import { useSchool } from "../../lib/hooks/useSchool";
import { recentActivity, type ActivityEntry, type SchoolData, type SchoolUser } from "../../lib/school";
import { updateSchoolSettings } from "../../lib/school/services";
import { formatTimestamp } from "../../lib/scheduling";

type Tab = "rules" | "activity";

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
    </div>

    {/* Remount the form when saved settings change so it shows the stored values. */}
    {tab === "rules" && <RulesForm key={JSON.stringify(view.settings)} user={user} settings={view.settings} onNotice={onNotice} />}

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
