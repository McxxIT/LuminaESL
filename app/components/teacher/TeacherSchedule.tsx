"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import StudentModal from "../student/StudentModal";
import type { AddTeacherLessonInput, CompleteLessonInput } from "./useTeacherWorkspace";
import { lessonTimeOptions, teacherFocusOptions } from "../../lib/data";
import { formatLessonDate, formatLongDate, isoDaysFromNow, parseISODate, todayISO } from "../../lib/student";
import type {
  TeacherAttendance,
  TeacherAvailability,
  TeacherLesson,
  TeacherSettings,
  TeacherStudent,
} from "../../lib/types";

type ScheduleProps = {
  settings: TeacherSettings;
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  availability: TeacherAvailability[];
  onAddLesson: (input: AddTeacherLessonInput) => void;
  onRescheduleLesson: (id: string, date: string, time: string, duration: number) => void;
  onCancelLesson: (id: string, reason: string) => void;
  onStartLesson: (id: string) => void;
  onCompleteLesson: (id: string, input: CompleteLessonInput) => void;
  onToggleAvailability: (id: string) => void;
  onSetAvailabilityActive: (active: boolean) => void;
  onNotice: (message: string) => void;
};

const tabs = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const weekDays: TeacherAvailability["day"][] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const statusLabels: Record<TeacherLesson["status"], string> = {
  scheduled: "Scheduled",
  live: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
};

function withinLastDays(date: string, days: number) {
  const diff = (parseISODate(todayISO()).getTime() - parseISODate(date).getTime()) / 86_400_000;
  return diff >= 0 && diff < days;
}

export default function TeacherSchedule({ settings, lessons, students, availability, onAddLesson, onRescheduleLesson, onCancelLesson, onStartLesson, onCompleteLesson, onToggleAvailability, onSetAvailabilityActive, onNotice }: ScheduleProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("upcoming");
  const [query, setQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("Schedule conflict");
  const [addForm, setAddForm] = useState({
    studentId: students[0]?.id ?? "",
    title: teacherFocusOptions[0],
    date: isoDaysFromNow(1),
    time: "10:00",
    duration: settings.defaultDuration,
    notes: "",
  });
  const [rescheduleForm, setRescheduleForm] = useState({ date: isoDaysFromNow(1), time: "10:00", duration: settings.defaultDuration });
  const [completeForm, setCompleteForm] = useState<CompleteLessonInput>({ attendance: "attended", feedback: "", homework: "" });

  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? null;
  const rescheduleTarget = lessons.find((lesson) => lesson.id === rescheduleId) ?? null;
  const cancelTarget = lessons.find((lesson) => lesson.id === cancelId) ?? null;
  const completeTarget = lessons.find((lesson) => lesson.id === completeId) ?? null;

  const counts = useMemo(() => ({
    upcoming: lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "live").length,
    completed: lessons.filter((lesson) => lesson.status === "completed").length,
    cancelled: lessons.filter((lesson) => lesson.status === "cancelled").length,
  }), [lessons]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return lessons
      .filter((lesson) => tab === "upcoming" ? lesson.status === "scheduled" || lesson.status === "live" : lesson.status === tab)
      .filter((lesson) => studentFilter === "all" || lesson.studentId === studentFilter)
      .filter((lesson) => !search || `${lesson.title} ${lesson.studentName} ${lesson.focus.join(" ")}`.toLowerCase().includes(search))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [lessons, query, studentFilter, tab]);

  const today = todayISO();
  const todaysLessons = lessons.filter((lesson) => lesson.date === today);
  const weeklyHours = lessons
    .filter((lesson) => lesson.status === "completed" && withinLastDays(lesson.date, 7))
    .reduce((total, lesson) => total + lesson.duration / 60, 0);
  const availabilityOn = availability.some((slot) => slot.active);

  function openAdd() {
    setAddForm({
      studentId: students[0]?.id ?? "",
      title: teacherFocusOptions[0],
      date: isoDaysFromNow(1),
      time: "10:00",
      duration: settings.defaultDuration,
      notes: "",
    });
    setAddOpen(true);
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const student = students.find((item) => item.id === addForm.studentId);
    if (!student) {
      onNotice("Choose a student for this lesson.");
      return;
    }
    if (!addForm.date || addForm.date < today) {
      onNotice("Choose today or a future date.");
      return;
    }
    onAddLesson({
      studentId: student.id,
      date: addForm.date,
      time: addForm.time,
      duration: Number(addForm.duration),
      title: addForm.title,
      focus: [addForm.title.split(" ")[0], "Tutoring"],
      notes: addForm.notes.trim() || `Focus on ${addForm.title.toLowerCase()} with ${student.name}.`,
    });
    setAddOpen(false);
    setTab("upcoming");
    onNotice(`${addForm.title} scheduled with ${student.name} for ${formatLessonDate(addForm.date)} at ${addForm.time}.`);
  }

  function openReschedule(lesson: TeacherLesson) {
    setRescheduleForm({ date: lesson.date >= today ? lesson.date : isoDaysFromNow(1), time: lesson.time, duration: String(lesson.duration) as TeacherSettings["defaultDuration"] });
    setSelectedId(null);
    setRescheduleId(lesson.id);
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleTarget) return;
    if (!rescheduleForm.date || rescheduleForm.date < today) {
      onNotice("Choose today or a future date for the reschedule.");
      return;
    }
    onRescheduleLesson(rescheduleTarget.id, rescheduleForm.date, rescheduleForm.time, Number(rescheduleForm.duration));
    setRescheduleId(null);
    setSelectedId(null);
    onNotice(`Lesson rescheduled to ${formatLessonDate(rescheduleForm.date)} at ${rescheduleForm.time}.`);
  }

  function submitCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    onCancelLesson(cancelTarget.id, cancelReason.trim() || "Cancelled by teacher");
    setCancelId(null);
    setSelectedId(null);
    setTab("cancelled");
    onNotice("Lesson cancelled and the student will be notified.");
  }

  function openComplete(lesson: TeacherLesson) {
    setCompleteForm({ attendance: "attended", feedback: "", homework: lesson.homework ?? "" });
    setSelectedId(null);
    setCompleteId(lesson.id);
  }

  function submitComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completeTarget) return;
    onCompleteLesson(completeTarget.id, completeForm);
    setCompleteId(null);
    setSelectedId(null);
    setTab("completed");
    onNotice(completeForm.attendance === "attended" ? `${completeTarget.title} marked complete.` : `${completeTarget.title} marked as a no-show.`);
  }

  function startLesson(lesson: TeacherLesson) {
    onStartLesson(lesson.id);
    onNotice(`Classroom ${lesson.roomCode} is now live for ${lesson.studentName}.`);
  }

  function statusPill(lesson: TeacherLesson) {
    return <span className={`teacher-lesson-status ${lesson.status}`}>{statusLabels[lesson.status]}</span>;
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHING SCHEDULE</p><h1>Lessons & availability</h1><p className="subheading">Plan sessions, open classrooms, and keep your booking windows current.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onSetAvailabilityActive(!availabilityOn)}><Icon name="clock" size={15} /> {availabilityOn ? "Pause bookings" : "Resume bookings"}</button>
        <button type="button" className="primary-button" onClick={openAdd}><Icon name="calendarAdd" size={15} /> Add lesson</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="calendar" /></span><div><span>TODAY</span><strong>{todaysLessons.length}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="clock" /></span><div><span>UPCOMING</span><strong>{counts.upcoming}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>COMPLETED</span><strong>{counts.completed}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="zap" /></span><div><span>HOURS THIS WEEK</span><strong>{weeklyHours.toFixed(1)} <em>hrs</em></strong></div></article>
    </section>

    <section className="panel student-panel student-lesson-panel">
      <div className="student-tabbar" role="tablist" aria-label="Lesson status">
        {tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.key} className={`student-tab ${tab === item.key ? "active" : ""}`} key={item.key} onClick={() => setTab(item.key)}>
          {item.label}<span>{counts[item.key]}</span>
        </button>)}
      </div>
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons, students, or skills…" aria-label="Search lessons" /></label>
        <label className="student-select"><Icon name="filter" size={15} /><select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} aria-label="Filter by student"><option value="all">All students</option>{students.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label>
        <span className="student-filter-count">Showing {filtered.length} of {counts[tab]} {tab} lessons</span>
      </div>

      <div className="student-lesson-list">
        {filtered.map((lesson) => <article className={`student-lesson-item teacher-lesson-item status-${lesson.status}`} key={lesson.id}>
          <button type="button" className="lesson-card-main" onClick={() => setSelectedId(lesson.id)}>
            <div className="lesson-date-block"><strong>{formatLessonDate(lesson.date)}</strong><span>{lesson.time}–{lesson.endTime}</span></div>
            <div className={`avatar avatar-${lesson.studentColor}`}>{lesson.studentInitials}</div>
            <div className="lesson-card-copy">
              <div className="lesson-card-title"><strong>{lesson.title}</strong>{lesson.roomCode && <span className="lesson-room">{lesson.roomCode}</span>}{statusPill(lesson)}</div>
              <small>{lesson.studentName} · {lesson.duration} minutes</small>
              <div className="lesson-tags">{lesson.focus.map((focus) => <span key={focus}>{focus}</span>)}</div>
            </div>
          </button>
          <div className="lesson-card-actions">
            {lesson.status === "scheduled" && <>
              <button type="button" className="primary-button compact-button" onClick={() => startLesson(lesson)}><Icon name="video" size={14} /> Start</button>
              <button type="button" className="icon-text-button" onClick={() => openReschedule(lesson)}><Icon name="calendar" size={14} /> Reschedule</button>
              <button type="button" className="icon-text-button danger-text" onClick={() => { setCancelReason("Schedule conflict"); setCancelId(lesson.id); }}><Icon name="x" size={14} /> Cancel</button>
            </>}
            {lesson.status === "live" && <>
              <button type="button" className="primary-button compact-button" onClick={() => onNotice(`Classroom ${lesson.roomCode} is open.`)}><Icon name="video" size={14} /> Join</button>
              <button type="button" className="secondary-button compact-button" onClick={() => openComplete(lesson)}><Icon name="check" size={14} /> Complete</button>
            </>}
            {lesson.status === "completed" && <button type="button" className="secondary-button compact-button" onClick={() => setSelectedId(lesson.id)}><Icon name="file" size={14} /> View report</button>}
            {lesson.status === "cancelled" && <span className="teacher-cancelled-note">{lesson.cancelReason ?? "Cancelled"}</span>}
          </div>
        </article>)}

        {filtered.length === 0 && <div className="student-empty-state">
          <div className="student-empty-icon"><Icon name={tab === "upcoming" ? "calendar" : tab === "completed" ? "check" : "clock"} size={22} /></div>
          <h3>No {tab} lessons found</h3>
          <p>{query || studentFilter !== "all" ? "Try clearing your search or choosing another student." : tab === "upcoming" ? "Add a lesson to this week's schedule." : "Lessons will appear here after you complete or cancel them."}</p>
          {tab === "upcoming" && <button type="button" className="primary-button" onClick={openAdd}><Icon name="plus" size={15} /> Add lesson</button>}
        </div>}
      </div>
    </section>

    <section className="panel student-panel teacher-availability-panel">
      <div className="panel-header">
        <div><h2>Weekly availability</h2><p>Tap a block to open or close it for new bookings</p></div>
        <button type="button" className="text-button" onClick={() => { onSetAvailabilityActive(!availabilityOn); onNotice(!availabilityOn ? "All availability blocks opened." : "All availability blocks paused."); }}>{availabilityOn ? "Pause all" : "Open all"}</button>
      </div>
      <div className="teacher-availability-grid">
        {weekDays.map((day) => {
          const slots = availability.filter((slot) => slot.day === day);
          return <div className="teacher-day-column" key={day}>
            <div className="teacher-day-head"><span>{day}</span><small>{slots.filter((slot) => slot.active).length} open</small></div>
            {slots.map((slot) => <button type="button" className={`teacher-availability-slot ${slot.active ? "active" : ""}`} key={slot.id} onClick={() => { onToggleAvailability(slot.id); onNotice(`${day} ${slot.startTime}–${slot.endTime} ${slot.active ? "closed" : "opened"} for bookings.`); }}>
              <strong>{slot.startTime}–{slot.endTime}</strong><small>{slot.active ? "Available" : "Unavailable"}</small>
            </button>)}
            {slots.length === 0 && <span className="teacher-availability-empty">No blocks</span>}
          </div>;
        })}
      </div>
    </section>

    {selected && <StudentModal eyebrow="LESSON DETAILS" title={selected.title} description={`${selected.studentName} · ${formatLongDate(selected.date)} · ${selected.time}–${selected.endTime}`} onClose={() => setSelectedId(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedId(null)}>Close</button>
        {selected.status === "scheduled" && <>
          <button type="button" className="cancel-button" onClick={() => openReschedule(selected)}>Reschedule</button>
          <button type="button" className="danger-outline-button" onClick={() => { setCancelReason("Schedule conflict"); setSelectedId(null); setCancelId(selected.id); }}>Cancel lesson</button>
          <button type="button" className="primary-button" onClick={() => startLesson(selected)}>Start classroom</button>
        </>}
        {selected.status === "live" && <>
          <button type="button" className="secondary-button" onClick={() => openComplete(selected)}>Mark complete</button>
          <button type="button" className="primary-button" onClick={() => onNotice(`Classroom ${selected.roomCode} is open.`)}>Join classroom</button>
        </>}
        {selected.status === "completed" && <button type="button" className="secondary-button" onClick={() => openComplete(selected)}>Update report</button>}
      </>}>
      <div className="lesson-detail-grid">
        <div><span className="eyebrow">STUDENT</span><strong>{selected.studentName}</strong></div>
        <div><span className="eyebrow">TIME</span><strong>{selected.time}–{selected.endTime}</strong></div>
        <div><span className="eyebrow">DURATION</span><strong>{selected.duration} minutes</strong></div>
        <div><span className="eyebrow">ROOM</span><strong>{selected.roomCode ?? "No room assigned"}</strong></div>
      </div>
      <div className="lesson-detail-section"><span className="eyebrow">FOCUS</span><div className="lesson-tags">{selected.focus.map((focus) => <span key={focus}>{focus}</span>)}</div></div>
      {selected.notes && <div className="lesson-detail-section"><span className="eyebrow">LESSON NOTES</span><p>{selected.notes}</p></div>}
      {selected.attendance && <div className="lesson-detail-section"><span className="eyebrow">ATTENDANCE</span><p>{selected.attendance === "attended" ? "Attended" : "No-show"}</p></div>}
      {selected.feedback && <div className="lesson-detail-section"><span className="eyebrow">TEACHER FEEDBACK</span><blockquote>{selected.feedback}</blockquote></div>}
      {selected.homework && <div className="lesson-callout"><Icon name="book" size={16} /><div><strong>Homework assigned</strong><p>{selected.homework}</p></div></div>}
      {selected.status === "cancelled" && <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Cancellation note</strong><p>{selected.cancelReason ?? "This lesson was cancelled."}</p></div></div>}
    </StudentModal>}

    {addOpen && <StudentModal eyebrow="SCHEDULE A SESSION" title="Add a lesson" description="Create a session with one of your students." onClose={() => setAddOpen(false)}
      footer={<><button type="button" className="cancel-button" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" form="add-teacher-lesson-form" className="primary-button"><Icon name="calendarAdd" size={15} /> Confirm lesson</button></>}>
      <form id="add-teacher-lesson-form" className="student-form-grid" onSubmit={submitAdd}>
        <label>Student<select value={addForm.studentId} onChange={(event) => setAddForm({ ...addForm, studentId: event.target.value })}>{students.map((student) => <option value={student.id} key={student.id}>{student.name} — {student.level}</option>)}</select></label>
        <label>Lesson focus<select value={addForm.title} onChange={(event) => setAddForm({ ...addForm, title: event.target.value })}>{teacherFocusOptions.map((focus) => <option value={focus} key={focus}>{focus}</option>)}</select></label>
        <label>Date<input type="date" min={today} value={addForm.date} onChange={(event) => setAddForm({ ...addForm, date: event.target.value })} required /></label>
        <label>Start time<select value={addForm.time} onChange={(event) => setAddForm({ ...addForm, time: event.target.value })}>{lessonTimeOptions.map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
        <label>Duration<select value={addForm.duration} onChange={(event) => setAddForm({ ...addForm, duration: event.target.value as TeacherSettings["defaultDuration"] })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
        <label className="full-field">Notes<textarea rows={3} value={addForm.notes} onChange={(event) => setAddForm({ ...addForm, notes: event.target.value })} placeholder="What should the student prepare?" /></label>
      </form>
    </StudentModal>}

    {rescheduleTarget && <StudentModal eyebrow="RESCHEDULE" title={`Move ${rescheduleTarget.title}`} description={`Currently ${formatLessonDate(rescheduleTarget.date)} at ${rescheduleTarget.time} with ${rescheduleTarget.studentName}.`} onClose={() => setRescheduleId(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setRescheduleId(null)}>Keep current time</button><button type="submit" form="teacher-reschedule-form" className="primary-button">Save new time</button></>}>
      <form id="teacher-reschedule-form" className="student-form-grid" onSubmit={submitReschedule}>
        <label>New date<input type="date" min={today} value={rescheduleForm.date} onChange={(event) => setRescheduleForm({ ...rescheduleForm, date: event.target.value })} required /></label>
        <label>New start time<select value={rescheduleForm.time} onChange={(event) => setRescheduleForm({ ...rescheduleForm, time: event.target.value })}>{lessonTimeOptions.map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
        <label>Duration<select value={rescheduleForm.duration} onChange={(event) => setRescheduleForm({ ...rescheduleForm, duration: event.target.value as TeacherSettings["defaultDuration"] })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      </form>
    </StudentModal>}

    {cancelTarget && <StudentModal eyebrow="CANCEL LESSON" title={`Cancel ${cancelTarget.title}?`} description="The student will be notified and the slot will reopen for bookings." onClose={() => setCancelId(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setCancelId(null)}>Keep lesson</button><button type="submit" form="teacher-cancel-form" className="danger-button">Cancel lesson</button></>}>
      <form id="teacher-cancel-form" onSubmit={submitCancel}>
        <label className="student-field">Reason<select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option>Schedule conflict</option><option>Student requested a change</option><option>Teacher unavailable</option><option>Technical issue</option><option>Other</option></select></label>
        <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Notification</strong><p>The student sees the cancellation reason and can rebook from their lesson page.</p></div></div>
      </form>
    </StudentModal>}

    {completeTarget && <StudentModal eyebrow="LESSON REPORT" title={`Complete ${completeTarget.title}`} description={`${completeTarget.studentName} · ${formatLongDate(completeTarget.date)} · ${completeTarget.time}–${completeTarget.endTime}`} onClose={() => setCompleteId(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setCompleteId(null)}>Cancel</button><button type="submit" form="teacher-complete-form" className="primary-button"><Icon name="check" size={15} /> Save report</button></>}>
      <form id="teacher-complete-form" className="student-form-grid" onSubmit={submitComplete}>
        <label>Attendance<select value={completeForm.attendance} onChange={(event) => setCompleteForm({ ...completeForm, attendance: event.target.value as TeacherAttendance })}><option value="attended">Attended</option><option value="no-show">No-show</option></select></label>
        <label className="full-field">Feedback<textarea rows={4} value={completeForm.feedback} onChange={(event) => setCompleteForm({ ...completeForm, feedback: event.target.value })} placeholder="What went well? What should the student practise next?" /></label>
        <label className="full-field">Homework<textarea rows={2} value={completeForm.homework} onChange={(event) => setCompleteForm({ ...completeForm, homework: event.target.value })} placeholder="Optional prep task for the student." /></label>
        <p className="student-form-note full-field">The report is saved to the lesson history and the student&apos;s progress is updated.</p>
      </form>
    </StudentModal>}
  </div>;
}
