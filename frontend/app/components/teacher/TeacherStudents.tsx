"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import StudentModal from "../student/StudentModal";
import { downloadTextFile, formatLessonDate, todayISO } from "../../lib/student";
import type { ServiceCall } from "../../lib/school/services";
import type { TeacherHomework, TeacherLesson, TeacherStudent } from "../../lib/types";

type StudentsProps = {
  students: TeacherStudent[];
  lessons: TeacherLesson[];
  onAddNote: (studentId: string, body: string) => void;
  onAssignHomework: (studentId: string, title: string, dueLabel: string) => ServiceCall<unknown>;
  onReviewHomework: (homeworkId: string, feedback: string, grade: string) => ServiceCall<unknown>;
  onNotice: (message: string) => void;
};

const statusLabels: Record<TeacherStudent["status"], string> = {
  active: "Active",
  "at-risk": "Needs attention",
  paused: "Paused",
};

const homeworkLabels: Record<TeacherStudent["homework"][number]["status"], string> = {
  assigned: "Assigned",
  submitted: "Submitted",
  reviewed: "Reviewed",
};

export default function TeacherStudents({ students, lessons, onAddNote, onAssignHomework, onReviewHomework, onNotice }: StudentsProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [homeworkTargetId, setHomeworkTargetId] = useState<string | null>(null);
  const [homeworkForm, setHomeworkForm] = useState({ title: "", dueLabel: "Due in 3 days" });
  const [reviewTarget, setReviewTarget] = useState<TeacherHomework | null>(null);
  const [reviewForm, setReviewForm] = useState({ feedback: "", grade: "" });

  const selected = students.find((student) => student.id === selectedId) ?? null;
  const homeworkTarget = students.find((student) => student.id === homeworkTargetId) ?? null;
  const today = todayISO();

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return students
      .filter((student) => statusFilter === "all" || student.status === statusFilter)
      .filter((student) => !search || `${student.name} ${student.level} ${student.goal} ${student.email}`.toLowerCase().includes(search))
      .sort((a, b) => b.progress - a.progress);
  }, [query, statusFilter, students]);

  const activeCount = students.filter((student) => student.status === "active").length;
  const riskCount = students.filter((student) => student.status === "at-risk").length;
  const averageProgress = Math.round(students.reduce((total, student) => total + student.progress, 0) / Math.max(students.length, 1));
  const averageAttendance = Math.round(students.reduce((total, student) => total + student.attendance, 0) / Math.max(students.length, 1));

  function nextLessonFor(student: TeacherStudent) {
    return lessons
      .filter((lesson) => lesson.studentId === student.id && (lesson.status === "scheduled" || lesson.status === "live") && lesson.date >= today)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  }

  function lastLessonFor(student: TeacherStudent) {
    return lessons
      .filter((lesson) => lesson.studentId === student.id && lesson.status === "completed")
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
  }

  function openStudent(student: TeacherStudent) {
    setSelectedId(student.id);
    setNoteDraft("");
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!noteDraft.trim()) {
      onNotice("Write a note before saving.");
      return;
    }
    onAddNote(selected.id, noteDraft);
    setNoteDraft("");
    onNotice(`Note added to ${selected.name}'s profile.`);
  }

  function openHomework(student: TeacherStudent) {
    setHomeworkTargetId(student.id);
    setHomeworkForm({ title: "", dueLabel: "Due in 3 days" });
  }

  async function submitHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!homeworkTarget) return;
    if (!homeworkForm.title.trim()) {
      onNotice("Give the homework a clear title.");
      return;
    }
    const result = await onAssignHomework(homeworkTarget.id, homeworkForm.title, homeworkForm.dueLabel);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setHomeworkTargetId(null);
    onNotice(`Homework assigned to ${homeworkTarget.name}. It's on their Assignments page now.`);
  }

  function openReview(homework: TeacherHomework) {
    setReviewForm({ feedback: homework.feedback ?? "", grade: "" });
    setReviewTarget(homework);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget) return;
    const result = await onReviewHomework(reviewTarget.id, reviewForm.feedback, reviewForm.grade);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    onNotice(`${reviewTarget.title} reviewed. The student can see your feedback.`);
    setReviewTarget(null);
  }

  function downloadRoster() {
    const lines = [
      "LUMINA ESL — STUDENT ROSTER",
      "===========================",
      ...students.map((student) => [
        student.name,
        student.email,
        student.level,
        student.status,
        `${student.progress}% progress`,
        `${student.attendance}% attendance`,
        `${student.lessonsCompleted} lessons`,
      ].join(" · ")),
    ];
    downloadTextFile("lumina-teacher-roster.txt", lines.join("\n"));
    onNotice("Student roster downloaded.");
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">MY STUDENTS</p><h1>Student roster</h1><p className="subheading">Review progress, capture notes, and assign homework to keep every learner moving.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={downloadRoster}><Icon name="download" size={15} /> Download roster</button>
        <button type="button" className="primary-button" onClick={() => setStatusFilter("at-risk")}><Icon name="target" size={15} /> Review at-risk</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="users" /></span><div><span>ACTIVE STUDENTS</span><strong>{activeCount}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="target" /></span><div><span>NEEDS ATTENTION</span><strong>{riskCount}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="chart" /></span><div><span>AVG PROGRESS</span><strong>{averageProgress}%</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="check" /></span><div><span>AVG ATTENDANCE</span><strong>{averageAttendance}%</strong></div></article>
    </section>

    <div className="student-filterbar teacher-roster-filterbar">
      <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, levels, or goals…" aria-label="Search students" /></label>
      <label className="student-select"><Icon name="filter" size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="at-risk">Needs attention</option><option value="paused">Paused</option></select></label>
      <span className="student-filter-count">Showing {filtered.length} of {students.length} students</span>
    </div>

    <section className="teacher-student-grid">
      {filtered.map((student) => {
        const nextLesson = nextLessonFor(student);
        const lastLesson = lastLessonFor(student);
        const openHomeworkCount = student.homework.filter((item) => item.status !== "reviewed").length;
        return <article className="panel teacher-student-card" key={student.id}>
          <div className="teacher-student-head">
            <div className={`avatar avatar-${student.avatarColor}`}>{student.initials}</div>
            <div className="teacher-student-copy"><strong>{student.name}</strong><small>{student.email}</small></div>
            <span className={`teacher-student-status ${student.status}`}>{statusLabels[student.status]}</span>
          </div>
          <div className="teacher-student-levels"><span>{student.level}</span><Icon name="arrow" size={12} /><span>{student.targetLevel}</span></div>
          <p className="teacher-student-goal">{student.goal}</p>
          <div className="teacher-student-progress">
            <div><span>Course progress</span><strong>{student.progress}%</strong></div>
            <div className="bar"><i style={{ width: `${student.progress}%` }} /></div>
          </div>
          <div className="teacher-student-stats">
            <div><span>Attendance</span><strong>{student.attendance}%</strong></div>
            <div><span>Lessons</span><strong>{student.lessonsCompleted}</strong></div>
            <div><span>{nextLesson ? "Next" : "Last lesson"}</span><strong>{nextLesson ? formatLessonDate(nextLesson.date) : lastLesson ? formatLessonDate(lastLesson.date) : "—"}</strong></div>
          </div>
          <div className="teacher-student-flags">
            <span><Icon name="file" size={12} /> {student.homework.length} homework</span>
            <span><Icon name="message" size={12} /> {student.notes.length} notes</span>
            {openHomeworkCount > 0 && <span className="teacher-flag-warning">{openHomeworkCount} awaiting review</span>}
          </div>
          <div className="teacher-student-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => openStudent(student)}><Icon name="user" size={14} /> Open profile</button>
            <button type="button" className="icon-text-button" onClick={() => openHomework(student)}><Icon name="book" size={14} /> Assign homework</button>
          </div>
        </article>;
      })}
    </section>

    {filtered.length === 0 && <section className="panel student-panel"><div className="student-empty-state">
      <div className="student-empty-icon"><Icon name="users" size={22} /></div>
      <h3>No students match this view</h3>
      <p>Try a different search term or status filter.</p>
      <button type="button" className="secondary-button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Clear filters</button>
    </div></section>}

    {selected && !reviewTarget && <StudentModal eyebrow="STUDENT PROFILE" title={selected.name} description={`${selected.level} → ${selected.targetLevel} · ${selected.email}`} onClose={() => setSelectedId(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedId(null)}>Close</button>
        <button type="button" className="secondary-button" onClick={() => onNotice(`Message drafted for ${selected.name}.`)}><Icon name="message" size={14} /> Message</button>
        <button type="button" className="primary-button" onClick={() => openHomework(selected)}><Icon name="book" size={14} /> Assign homework</button>
      </>}>
      <div className="assignment-detail-meta">
        <div><span className="eyebrow">STATUS</span><strong className={`teacher-student-status ${selected.status}`}>{statusLabels[selected.status]}</strong></div>
        <div><span className="eyebrow">PROGRESS</span><strong>{selected.progress}%</strong></div>
        <div><span className="eyebrow">ATTENDANCE</span><strong>{selected.attendance}%</strong></div>
        <div><span className="eyebrow">LESSONS</span><strong>{selected.lessonsCompleted}</strong></div>
      </div>

      <div className="lesson-detail-section"><span className="eyebrow">LEARNING GOAL</span><p>{selected.goal}</p></div>
      <div className="teacher-detail-progress"><div><span>Course progress</span><strong>{selected.progress}%</strong></div><div className="bar"><i style={{ width: `${selected.progress}%` }} /></div></div>

      <div className="teacher-detail-columns">
        <div>
          <div className="panel-header teacher-detail-header"><div><h2>Teacher notes</h2><p>Private observations and next steps</p></div><span className="setting-count">{selected.notes.length}</span></div>
          <div className="teacher-note-list">
            {selected.notes.length > 0 ? selected.notes.map((note) => <div className="teacher-note" key={note.id}>
              <span>{note.date}</span><p>{note.body}</p>
            </div>) : <div className="student-empty-inline"><Icon name="message" /><p>No notes yet. Add the first observation below.</p></div>}
          </div>
          <form className="teacher-note-form" onSubmit={submitNote}>
            <label className="student-field">Add a note<textarea rows={3} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should you remember before the next lesson?" /></label>
            <button type="submit" className="secondary-button"><Icon name="save" size={14} /> Save note</button>
          </form>
        </div>
        <div>
          <div className="panel-header teacher-detail-header"><div><h2>Homework</h2><p>Assigned tasks and review status</p></div><span className="setting-count">{selected.homework.length}</span></div>
          <div className="teacher-homework-list">
            {selected.homework.length > 0 ? selected.homework.map((homework) => <div className="teacher-homework-row" key={homework.id}>
              <div><strong>{homework.title}</strong><small>Assigned {homework.assignedAt} · {homework.dueLabel}</small>{homework.response && <p className="teacher-homework-response"><strong>Answer:</strong> {homework.response}</p>}{homework.feedback && <p>{homework.feedback}</p>}</div>
              <div className="teacher-homework-actions">
                <span className={`teacher-homework-status ${homework.status}`}>{homeworkLabels[homework.status]}</span>
                {homework.status !== "reviewed" && <button type="button" className="icon-text-button" onClick={() => openReview(homework)}><Icon name="check" size={13} /> Review</button>}
              </div>
            </div>) : <div className="student-empty-inline"><Icon name="book" /><p>No homework assigned yet.</p></div>}
          </div>
        </div>
      </div>
    </StudentModal>}

    {homeworkTarget && <StudentModal eyebrow="HOMEWORK" title={`Assign homework to ${homeworkTarget.name}`} description="The task will appear in the student's assignment list." onClose={() => setHomeworkTargetId(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setHomeworkTargetId(null)}>Cancel</button><button type="submit" form="teacher-homework-form" className="primary-button"><Icon name="book" size={15} /> Assign homework</button></>}>
      <form id="teacher-homework-form" className="student-form-grid" onSubmit={submitHomework}>
        <label className="full-field">Task title<input value={homeworkForm.title} onChange={(event) => setHomeworkForm({ ...homeworkForm, title: event.target.value })} placeholder="e.g. Record a 2-minute product pitch" required /></label>
        <label className="full-field">Due date<select value={homeworkForm.dueLabel} onChange={(event) => setHomeworkForm({ ...homeworkForm, dueLabel: event.target.value })}><option>Due tomorrow</option><option>Due in 2 days</option><option>Due in 3 days</option><option>Due in 5 days</option><option>Due next lesson</option></select></label>
        <p className="student-form-note full-field">The student can submit the task from their Assignments page. You will see it here for review.</p>
      </form>
    </StudentModal>}
    {reviewTarget && <StudentModal eyebrow="REVIEW HOMEWORK" title={reviewTarget.title} description={`Assigned ${reviewTarget.assignedAt} · ${reviewTarget.dueLabel}`} onClose={() => setReviewTarget(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setReviewTarget(null)}>Cancel</button><button type="submit" form="teacher-review-form" className="primary-button"><Icon name="check" size={14} /> Mark reviewed</button></>}>
      <form id="teacher-review-form" className="student-form-grid" onSubmit={submitReview}>
        <div className="lesson-detail-section full-field"><span className="eyebrow">STUDENT ANSWER</span><p>{reviewTarget.response ?? "No answer submitted yet. You can still mark it reviewed."}</p></div>
        <label className="full-field">Feedback for the student<textarea rows={3} value={reviewForm.feedback} onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })} placeholder="What went well, and one thing to improve." autoFocus /></label>
        <label>Grade (optional)<input value={reviewForm.grade} onChange={(event) => setReviewForm({ ...reviewForm, grade: event.target.value })} placeholder="e.g. A-" maxLength={4} /></label>
      </form>
    </StudentModal>}
  </div>;
}
