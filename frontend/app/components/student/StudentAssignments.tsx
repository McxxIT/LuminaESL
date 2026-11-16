"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import type { ServiceResult } from "../../lib/school/services";
import StudentModal from "./StudentModal";
import type { StudentAssignment } from "../../lib/types";

type AssignmentsProps = {
  assignments: StudentAssignment[];
  onSubmitAssignment: (id: string, response: string) => ServiceResult<unknown>;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const filters = ["All", "Pending", "Submitted", "Graded"] as const;

function typeIcon(type: StudentAssignment["type"]) {
  if (type === "recording") return "mic" as const;
  if (type === "quiz") return "check" as const;
  if (type === "reading") return "book" as const;
  return "edit" as const;
}

export default function StudentAssignments({ assignments, onSubmitAssignment, onNavigate, onNotice }: AssignmentsProps) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [selected, setSelected] = useState<StudentAssignment | null>(null);
  const [submitTarget, setSubmitTarget] = useState<StudentAssignment | null>(null);
  const [response, setResponse] = useState("");

  const counts = useMemo(() => ({
    pending: assignments.filter((item) => item.status === "pending").length,
    submitted: assignments.filter((item) => item.status === "submitted").length,
    graded: assignments.filter((item) => item.status === "graded").length,
  }), [assignments]);

  const filtered = useMemo(() => {
    if (filter === "All") return assignments;
    return assignments.filter((assignment) => assignment.status === filter.toLowerCase());
  }, [assignments, filter]);

  function openSubmit(assignment: StudentAssignment) {
    setResponse("");
    setSubmitTarget(assignment);
  }

  function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitTarget || !response.trim()) {
      onNotice("Add a response before submitting your work.");
      return;
    }
    const result = onSubmitAssignment(submitTarget.id, response.trim());
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setSubmitTarget(null);
    setResponse("");
    setFilter("Submitted");
    onNotice(`${submitTarget.title} submitted to ${submitTarget.tutor}.`);
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">ASSIGNMENTS</p><h1>Homework & action items</h1><p className="subheading">Submit work, review tutor feedback, and keep your lesson preparation moving.</p></div>
          <div className="page-heading-actions"><span className="student-due-summary"><Icon name="clock" size={15} /> {counts.pending} pending</span><button type="button" className="secondary-button" onClick={() => onNavigate("Lessons")}><Icon name="calendar" size={15} /> Lesson schedule</button></div>
    </section>

    <section className="student-assignment-metrics">
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="clock" /></span><div><span>PENDING</span><strong>{counts.pending}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="upload" /></span><div><span>SUBMITTED</span><strong>{counts.submitted}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="award" /></span><div><span>GRADED</span><strong>{counts.graded}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="target" /></span><div><span>ON-TIME RATE</span><strong>94%</strong></div></article>
    </section>

    <section className="panel student-panel student-assignment-panel">
      <div className="student-pills student-assignment-filters">{filters.map((item) => <button type="button" className={`student-pill ${filter === item ? "active" : ""}`} key={item} onClick={() => setFilter(item)}>{item}{item !== "All" && <span>{counts[item.toLowerCase() as keyof typeof counts]}</span>}</button>)}</div>

      <div className="student-assignment-list">
        {filtered.map((assignment) => <article className={`student-assignment-card ${assignment.status}`} key={assignment.id}>
          <span className={`assignment-type ${assignment.type}`}><Icon name={typeIcon(assignment.type)} size={18} /></span>
          <div className="assignment-card-copy">
            <div className="assignment-card-title">
              <strong>{assignment.title}</strong>
              <span className={`assignment-status ${assignment.status}`}>{assignment.status === "pending" ? "Due" : assignment.status === "submitted" ? "Submitted" : "Graded"}</span>
              {assignment.grade && <span className="assignment-grade">{assignment.grade}</span>}
            </div>
            <p>{assignment.description}</p>
            <div className="assignment-meta"><span>{assignment.tutor}</span><span>·</span><span>{assignment.dueLabel}</span>{assignment.submittedAt && <><span>·</span><span>Submitted {assignment.submittedAt}</span></>}</div>
          </div>
          <div className="assignment-card-actions">
            {assignment.status === "pending" && <button type="button" className="primary-button compact-button" onClick={() => openSubmit(assignment)}>{assignment.type === "recording" ? "Submit audio" : assignment.type === "quiz" ? "Start quiz" : assignment.type === "reading" ? "Open reader" : "Submit work"}</button>}
            {assignment.status !== "pending" && <button type="button" className="secondary-button compact-button" onClick={() => setSelected(assignment)}>{assignment.status === "graded" ? "View feedback" : "View submission"}</button>}
          </div>
        </article>)}
        {filtered.length === 0 && <div className="student-empty-state">
          <div className="student-empty-icon"><Icon name="check" size={22} /></div>
          <h3>No {filter.toLowerCase()} assignments</h3>
          <p>{filter === "Pending" ? "You are all caught up. New assignments will appear here after your lessons." : "Nothing to show in this filter yet."}</p>
          <button type="button" className="secondary-button" onClick={() => setFilter("All")}>Show all assignments</button>
        </div>}
      </div>
    </section>

    <section className="panel student-panel assignment-help-card">
      <div className="metric-icon blue"><Icon name="help" /></div>
      <div><h2>Not sure how to start?</h2><p>Open the practice library for a short warm-up, or message your tutor from the lesson page.</p></div>
      <button type="button" className="secondary-button" onClick={() => onNotice("Your tutor has been notified that you may need help with an assignment.")}><Icon name="message" size={15} /> Ask tutor</button>
    </section>

    {selected && <StudentModal eyebrow={selected.status === "graded" ? "TUTOR FEEDBACK" : "YOUR SUBMISSION"} title={selected.title} description={`${selected.tutor} · ${selected.type} · ${selected.dueLabel}`} onClose={() => setSelected(null)} size="wide"
      footer={<><button type="button" className="cancel-button" onClick={() => setSelected(null)}>Close</button>{selected.status === "submitted" && <button type="button" className="primary-button" onClick={() => { setSelected(null); openSubmit(selected); }}>Update submission</button>}</>}>
      <div className="assignment-detail-meta">
        <div><span className="eyebrow">STATUS</span><strong className={`assignment-status ${selected.status}`}>{selected.status}</strong></div>
        <div><span className="eyebrow">TUTOR</span><strong>{selected.tutor}</strong></div>
        <div><span className="eyebrow">DUE</span><strong>{selected.dueLabel}</strong></div>
        {selected.grade && <div><span className="eyebrow">GRADE</span><strong className="assignment-grade-text">{selected.grade}</strong></div>}
      </div>
      <div className="lesson-detail-section"><span className="eyebrow">INSTRUCTIONS</span><p>{selected.instructions}</p></div>
      {selected.response && <div className="lesson-detail-section"><span className="eyebrow">YOUR RESPONSE</span><blockquote className="submission-quote">{selected.response}</blockquote>{selected.submittedAt && <small className="submission-date">Submitted {selected.submittedAt}</small>}</div>}
      {selected.feedback && <div className="lesson-callout"><Icon name="message" size={16} /><div><strong>Tutor feedback</strong><p>{selected.feedback}</p></div></div>}
    </StudentModal>}

    {submitTarget && <StudentModal eyebrow={submitTarget.type.toUpperCase()} title={submitTarget.title} description={`${submitTarget.tutor} · ${submitTarget.dueLabel}`} onClose={() => setSubmitTarget(null)} size="wide"
      footer={<><button type="button" className="cancel-button" onClick={() => setSubmitTarget(null)}>Cancel</button><button type="submit" form="assignment-submit-form" className="primary-button"><Icon name="upload" size={15} /> Submit assignment</button></>}>
      <form id="assignment-submit-form" className="student-submit-form" onSubmit={submitWork}>
        <div className="lesson-callout"><Icon name="help" size={16} /><div><strong>What to submit</strong><p>{submitTarget.instructions}</p></div></div>
        <label className="student-field">Your response<textarea rows={7} value={response} onChange={(event) => setResponse(event.target.value)} placeholder={submitTarget.type === "quiz" ? "Write your answers here, for example: 1-B, 2-A, 3-C…" : "Write or paste your work here. For recordings, add a link and a short transcript summary."} required /></label>
        <label className="student-field">Attachment (optional)<input type="file" onChange={(event) => { if (event.target.files?.[0]) onNotice(`${event.target.files[0].name} attached to your submission.`); }} /></label>
        <p className="student-form-note">Submissions are visible to {submitTarget.tutor}. You can update your response until it is graded.</p>
      </form>
    </StudentModal>}
  </div>;
}
