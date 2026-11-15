"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import StudentModal from "./StudentModal";
import type { BookLessonInput } from "./useStudentWorkspace";
import { lessonTimeOptions, studentTutors } from "../../lib/data";
import { addMinutes, downloadTextFile, formatLessonDate, formatLongDate, isoDaysFromNow, todayISO } from "../../lib/student";
import type { StudentLesson } from "../../lib/types";

type LessonsProps = {
  lessons: StudentLesson[];
  creditHours: number;
  onBookLesson: (input: BookLessonInput) => StudentLesson;
  onRescheduleLesson: (id: string, date: string, time: string, duration: number) => void;
  onCancelLesson: (id: string, reason: string) => void;
  onRebookLesson: (id: string) => StudentLesson | null;
  onNotice: (message: string) => void;
};

const tabs = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const focusOptions = ["Conversation practice", "Business English", "IELTS speaking", "Pronunciation clinic", "Grammar foundations", "Academic writing"];

function lessonSummary(lesson: StudentLesson) {
  const scoreLines = lesson.scores?.map((score) => `${score.label}: ${score.value.toFixed(1)}/5.0`).join("\n") ?? "No scores recorded.";
  const corrections = lesson.corrections?.map((item) => `- "${item.from}" → "${item.to}"`).join("\n") ?? "None recorded.";
  return [
    "LUMINA ESL — LESSON SUMMARY",
    "==============================",
    `Lesson: ${lesson.title}`,
    `Tutor: ${lesson.tutor}`,
    `Date: ${formatLongDate(lesson.date)}`,
    `Time: ${lesson.time}–${lesson.endTime} (${lesson.duration} minutes)`,
    `Focus: ${lesson.focus.join(", ")}`,
    "",
    "TEACHER FEEDBACK",
    lesson.feedback ?? "No feedback recorded.",
    "",
    "SCORES",
    scoreLines,
    "",
    "TARGET CORRECTIONS",
    corrections,
    "",
    "NOTES",
    lesson.notes ?? "No lesson notes.",
  ].join("\n");
}

export default function StudentLessons({ lessons, creditHours, onBookLesson, onRescheduleLesson, onCancelLesson, onRebookLesson, onNotice }: LessonsProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("upcoming");
  const [query, setQuery] = useState("");
  const [tutorFilter, setTutorFilter] = useState("all");
  const [selectedLesson, setSelectedLesson] = useState<StudentLesson | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<StudentLesson | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StudentLesson | null>(null);
  const [bookForm, setBookForm] = useState({ tutor: "Jamie Smith", title: "Conversation practice", date: isoDaysFromNow(1), time: "10:00", duration: "60", notes: "" });
  const [rescheduleForm, setRescheduleForm] = useState({ date: isoDaysFromNow(1), time: "10:00", duration: "60" });
  const [cancelReason, setCancelReason] = useState("Schedule conflict");

  const tutors = useMemo(() => Array.from(new Set(lessons.map((lesson) => lesson.tutor))), [lessons]);
  const counts = useMemo(() => ({
    upcoming: lessons.filter((lesson) => lesson.status === "upcoming").length,
    completed: lessons.filter((lesson) => lesson.status === "completed").length,
    cancelled: lessons.filter((lesson) => lesson.status === "cancelled").length,
  }), [lessons]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return lessons
      .filter((lesson) => lesson.status === tab)
      .filter((lesson) => tutorFilter === "all" || lesson.tutor === tutorFilter)
      .filter((lesson) => !search || `${lesson.title} ${lesson.tutor} ${lesson.focus.join(" ")}`.toLowerCase().includes(search))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [lessons, query, tab, tutorFilter]);

  function openBooking() {
    setBookForm({ tutor: "Jamie Smith", title: "Conversation practice", date: isoDaysFromNow(1), time: "10:00", duration: "60", notes: "" });
    setBookingOpen(true);
  }

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tutor = studentTutors.find((item) => item.name === bookForm.tutor);
    if (!tutor || !bookForm.date || bookForm.date < todayISO()) {
      onNotice("Choose a valid future date for your lesson.");
      return;
    }
    onBookLesson({
      date: bookForm.date,
      time: bookForm.time,
      duration: Number(bookForm.duration),
      title: bookForm.title,
      tutor: tutor.name,
      tutorInitials: tutor.initials,
      tutorColor: tutor.color,
      focus: [bookForm.title.split(" ")[0], "Tutoring"],
      notes: bookForm.notes.trim() || `Focus on ${bookForm.title.toLowerCase()} with ${tutor.name}.`,
    });
    setBookingOpen(false);
    setTab("upcoming");
    onNotice(`${bookForm.title} booked with ${tutor.name} for ${formatLessonDate(bookForm.date)} at ${bookForm.time}.`);
  }

  function openReschedule(lesson: StudentLesson) {
    setRescheduleForm({ date: lesson.date >= todayISO() ? lesson.date : isoDaysFromNow(1), time: lesson.time, duration: String(lesson.duration) });
    setRescheduleTarget(lesson);
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleTarget) return;
    if (!rescheduleForm.date || rescheduleForm.date < todayISO()) {
      onNotice("Choose a valid future date for the reschedule.");
      return;
    }
    onRescheduleLesson(rescheduleTarget.id, rescheduleForm.date, rescheduleForm.time, Number(rescheduleForm.duration));
    setRescheduleTarget(null);
    setSelectedLesson(null);
    onNotice(`Lesson rescheduled to ${formatLessonDate(rescheduleForm.date)} at ${rescheduleForm.time}.`);
  }

  function submitCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    onCancelLesson(cancelTarget.id, cancelReason.trim() || "Cancelled by student");
    setCancelTarget(null);
    setSelectedLesson(null);
    setTab("cancelled");
    onNotice("Lesson cancelled. Your lesson credit has been returned.");
  }

  function rebook(lesson: StudentLesson) {
    const next = onRebookLesson(lesson.id);
    if (!next) {
      onNotice("This lesson is no longer available to rebook.");
      return;
    }
    setSelectedLesson(null);
    setTab("upcoming");
    onNotice(`${lesson.title} rebooked with ${lesson.tutor} for ${formatLessonDate(next.date)}.`);
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">MY LESSONS</p><h1>Lessons & schedule</h1><p className="subheading">Review upcoming sessions, open lesson reports, and manage your calendar.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNotice("Your calendar is synced with your local timezone.")}><Icon name="globe" size={16} /> Timezone synced</button>
        <button type="button" className="primary-button" onClick={openBooking}><Icon name="plus" size={16} /> Book a lesson</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="calendar" /></span><div><span>UPCOMING</span><strong>{counts.upcoming}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>COMPLETED</span><strong>{counts.completed}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="clock" /></span><div><span>LESSON CREDITS</span><strong>{creditHours.toFixed(1)} <em>hrs</em></strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="award" /></span><div><span>ATTENDANCE</span><strong>96%</strong></div></article>
    </section>

    <section className="panel student-panel student-lesson-panel">
      <div className="student-tabbar" role="tablist" aria-label="Lesson status">
        {tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} className={`student-tab ${tab === item.key ? "active" : ""}`} key={item.key} onClick={() => setTab(item.key)}>
          {item.label}<span>{counts[item.key]}</span>
        </button>)}
      </div>
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons, tutors, or skills…" aria-label="Search lessons" /></label>
        <label className="student-select"><Icon name="filter" size={15} /><select value={tutorFilter} onChange={(event) => setTutorFilter(event.target.value)} aria-label="Filter by tutor"><option value="all">All tutors</option>{tutors.map((tutor) => <option value={tutor} key={tutor}>{tutor}</option>)}</select></label>
        <span className="student-filter-count">Showing {filtered.length} of {counts[tab]} {tab} lessons</span>
      </div>

      <div className="student-lesson-list">
        {filtered.map((lesson) => <article className={`student-lesson-item status-${lesson.status}`} key={lesson.id}>
          <button type="button" className="lesson-card-main" onClick={() => setSelectedLesson(lesson)}>
            <div className="lesson-date-block"><strong>{formatLessonDate(lesson.date)}</strong><span>{lesson.time}–{lesson.endTime}</span></div>
            <div className={`avatar avatar-${lesson.tutorColor}`}>{lesson.tutorInitials}</div>
            <div className="lesson-card-copy">
              <div className="lesson-card-title"><strong>{lesson.title}</strong>{lesson.roomCode && <span className="lesson-room">{lesson.roomCode}</span>}</div>
              <small>{lesson.tutor} · {lesson.duration} minutes</small>
              <div className="lesson-tags">{lesson.focus.map((focus) => <span key={focus}>{focus}</span>)}</div>
            </div>
          </button>
          <div className="lesson-card-actions">
            {lesson.status === "upcoming" && <>
              <button type="button" className="primary-button compact-button" onClick={() => onNotice(`Classroom ${lesson.roomCode} opens 5 minutes before the lesson.`)}><Icon name="video" size={14} /> Join</button>
              <button type="button" className="icon-text-button" onClick={() => openReschedule(lesson)}><Icon name="calendar" size={14} /> Reschedule</button>
              <button type="button" className="icon-text-button danger-text" onClick={() => { setCancelReason("Schedule conflict"); setCancelTarget(lesson); }}><Icon name="x" size={14} /> Cancel</button>
            </>}
            {lesson.status === "completed" && <>
              <button type="button" className="secondary-button compact-button" onClick={() => setSelectedLesson(lesson)}><Icon name="file" size={14} /> View report</button>
              <button type="button" className="icon-text-button" onClick={() => rebook(lesson)}><Icon name="repeat" size={14} /> Rebook</button>
            </>}
            {lesson.status === "cancelled" && <button type="button" className="secondary-button compact-button" onClick={() => rebook(lesson)}><Icon name="repeat" size={14} /> Rebook lesson</button>}
          </div>
        </article>)}

        {filtered.length === 0 && <div className="student-empty-state">
          <div className="student-empty-icon"><Icon name={tab === "upcoming" ? "calendar" : tab === "completed" ? "check" : "clock"} size={22} /></div>
          <h3>No {tab} lessons found</h3>
          <p>{query || tutorFilter !== "all" ? "Try clearing your search or choosing another tutor." : tab === "upcoming" ? "Book a session to start building your week." : "Lessons will appear here after you complete or cancel them."}</p>
          {tab === "upcoming" && <button type="button" className="primary-button" onClick={openBooking}><Icon name="plus" size={15} /> Book a lesson</button>}
        </div>}
      </div>
    </section>

    {selectedLesson && <StudentModal eyebrow={selectedLesson.status.toUpperCase()} title={selectedLesson.title} description={`${selectedLesson.tutor} · ${formatLongDate(selectedLesson.date)} · ${selectedLesson.time}–${selectedLesson.endTime}`} onClose={() => setSelectedLesson(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedLesson(null)}>Close</button>
        {selectedLesson.status === "upcoming" && <>
          <button type="button" className="cancel-button" onClick={() => openReschedule(selectedLesson)}>Reschedule</button>
          <button type="button" className="danger-outline-button" onClick={() => { setCancelReason("Schedule conflict"); setCancelTarget(selectedLesson); }}>Cancel lesson</button>
          <button type="button" className="primary-button" onClick={() => onNotice(`Classroom ${selectedLesson.roomCode} opens 5 minutes before the lesson.`)}>Join classroom</button>
        </>}
        {selectedLesson.status === "completed" && <>
          <button type="button" className="secondary-button" onClick={() => onNotice("Lesson whiteboard opened.")}>Shared whiteboard</button>
          <button type="button" className="secondary-button" onClick={() => { downloadTextFile(`lumina-lesson-${selectedLesson.id}.txt`, lessonSummary(selectedLesson)); onNotice("Lesson summary downloaded."); }}>Download summary</button>
          <button type="button" className="primary-button" onClick={() => rebook(selectedLesson)}>Rebook {selectedLesson.tutor.split(" ")[0]}</button>
        </>}
        {selectedLesson.status === "cancelled" && <button type="button" className="primary-button" onClick={() => rebook(selectedLesson)}>Rebook lesson</button>}
      </>}>
      <div className="lesson-detail-grid">
        <div><span className="eyebrow">DATE</span><strong>{formatLongDate(selectedLesson.date)}</strong></div>
        <div><span className="eyebrow">TIME</span><strong>{selectedLesson.time}–{selectedLesson.endTime}</strong></div>
        <div><span className="eyebrow">DURATION</span><strong>{selectedLesson.duration} minutes</strong></div>
        <div><span className="eyebrow">ROOM</span><strong>{selectedLesson.roomCode ?? "No room assigned"}</strong></div>
      </div>
      <div className="lesson-detail-section"><span className="eyebrow">FOCUS</span><div className="lesson-tags">{selectedLesson.focus.map((focus) => <span key={focus}>{focus}</span>)}</div></div>
      {selectedLesson.notes && <div className="lesson-detail-section"><span className="eyebrow">LESSON NOTES</span><p>{selectedLesson.notes}</p></div>}
      {selectedLesson.homework && <div className="lesson-callout"><Icon name="book" size={16} /><div><strong>Prepare before class</strong><p>{selectedLesson.homework}</p></div></div>}
      {selectedLesson.status === "completed" && <>
        {selectedLesson.scores && <div className="report-scores">{selectedLesson.scores.map((score) => <div key={score.label}><strong>{score.value.toFixed(1)}<em>/5.0</em></strong><span>{score.label}</span></div>)}</div>}
        {selectedLesson.feedback && <div className="lesson-detail-section"><span className="eyebrow">TEACHER FEEDBACK</span><blockquote>{selectedLesson.feedback}</blockquote></div>}
        {selectedLesson.corrections && selectedLesson.corrections.length > 0 && <div className="lesson-detail-section"><span className="eyebrow">TARGET CORRECTIONS</span><div className="correction-list">{selectedLesson.corrections.map((item) => <span key={item.from}><s>{item.from}</s> → <strong>{item.to}</strong></span>)}</div></div>}
      </>}
      {selectedLesson.status === "cancelled" && <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Cancellation note</strong><p>{selectedLesson.cancelReason ?? "This lesson was cancelled."}</p></div></div>}
    </StudentModal>}

    {bookingOpen && <StudentModal eyebrow="SCHEDULE A SESSION" title="Book a lesson" description="Pick a tutor, date, and focus for your next session." onClose={() => setBookingOpen(false)}
      footer={<><button type="button" className="cancel-button" onClick={() => setBookingOpen(false)}>Cancel</button><button type="submit" form="book-lesson-form" className="primary-button"><Icon name="calendarAdd" size={15} /> Confirm booking</button></>}>
      <form id="book-lesson-form" className="student-form-grid" onSubmit={submitBooking}>
        <label>Tutor<select value={bookForm.tutor} onChange={(event) => setBookForm({ ...bookForm, tutor: event.target.value })}>{studentTutors.map((tutor) => <option value={tutor.name} key={tutor.name}>{tutor.name} — {tutor.specialty}</option>)}</select></label>
        <label>Lesson focus<select value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}>{focusOptions.map((focus) => <option value={focus} key={focus}>{focus}</option>)}</select></label>
        <label>Date<input type="date" min={todayISO()} value={bookForm.date} onChange={(event) => setBookForm({ ...bookForm, date: event.target.value })} required /></label>
        <label>Start time<select value={bookForm.time} onChange={(event) => setBookForm({ ...bookForm, time: event.target.value })}>{lessonTimeOptions.map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
        <label>Duration<select value={bookForm.duration} onChange={(event) => setBookForm({ ...bookForm, duration: event.target.value })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
        <label className="full-field">Notes for your tutor<textarea rows={3} value={bookForm.notes} onChange={(event) => setBookForm({ ...bookForm, notes: event.target.value })} placeholder="What would you like to focus on?" /></label>
        <div className="booking-summary full-field"><Icon name="clock" size={16} /><span>{formatLessonDate(bookForm.date)} · {bookForm.time}–{addMinutes(bookForm.time, Number(bookForm.duration))} · {bookForm.duration} minutes</span></div>
      </form>
    </StudentModal>}

    {rescheduleTarget && <StudentModal eyebrow="RESCHEDULE" title={`Move ${rescheduleTarget.title}`} description={`Currently ${formatLessonDate(rescheduleTarget.date)} at ${rescheduleTarget.time} with ${rescheduleTarget.tutor}.`} onClose={() => setRescheduleTarget(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setRescheduleTarget(null)}>Keep current time</button><button type="submit" form="reschedule-form" className="primary-button">Save new time</button></>}>
      <form id="reschedule-form" className="student-form-grid" onSubmit={submitReschedule}>
        <label>New date<input type="date" min={todayISO()} value={rescheduleForm.date} onChange={(event) => setRescheduleForm({ ...rescheduleForm, date: event.target.value })} required /></label>
        <label>New start time<select value={rescheduleForm.time} onChange={(event) => setRescheduleForm({ ...rescheduleForm, time: event.target.value })}>{lessonTimeOptions.map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
        <label>Duration<select value={rescheduleForm.duration} onChange={(event) => setRescheduleForm({ ...rescheduleForm, duration: event.target.value })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      </form>
    </StudentModal>}

    {cancelTarget && <StudentModal eyebrow="CANCEL LESSON" title={`Cancel ${cancelTarget.title}?`} description="Your lesson credit will be returned to your wallet. You can rebook at any time." onClose={() => setCancelTarget(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setCancelTarget(null)}>Keep lesson</button><button type="submit" form="cancel-form" className="danger-button">Cancel lesson</button></>}>
      <form id="cancel-form" onSubmit={submitCancel}>
        <label className="student-field">Reason<select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option>Schedule conflict</option><option>Feeling unwell</option><option>Need to prepare more</option><option>Technical issue</option><option>Other</option></select></label>
        <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Late cancellation policy</strong><p>Cancel at least 4 hours before the lesson to keep your credit. This demo always returns the credit.</p></div></div>
      </form>
    </StudentModal>}
  </div>;
}
