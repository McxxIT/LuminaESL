"use client";

import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Icon from "../Icon";
import StudentModal from "../student/StudentModal";
import type { AddTeacherLessonInput, CancelLessonRequestInput, CompleteLessonInput } from "./useTeacherWorkspace";
import { teacherFocusOptions } from "../../lib/data";
import type { ServiceCall } from "../../lib/school/services";
import { downloadAttachmentFile } from "../../lib/school/attachment-download";
import { buildDaySlots, canJoinLesson, LESSON_SLOT_MINUTES, slotStartDate } from "../../lib/scheduling";
import { ON_THE_SPOT_CANCELLATION_POINTS } from "../../lib/teacherPerformance";
import { useSchool } from "../../lib/hooks/useSchool";
import { performanceRules } from "../../lib/school";
import {
  downloadTextFile,
  formatLessonDate,
  formatLongDate,
  isoDaysFromNow,
  parseISODate,
  todayISO,
} from "../../lib/student";
import type {
  TeacherAttendance,
  TeacherLesson,
  TeacherLessonAttachment,
  TeacherLessonMaterial,
  TeacherSlotClosure,
  TeacherSlotOpening,
  TeacherStudent,
} from "../../lib/types";

function lessonMaterialText(lesson: TeacherLesson, material: TeacherLessonMaterial) {
  return [
    material.title,
    "=".repeat(material.title.length),
    "",
    `Lesson: ${lesson.title} with ${lesson.studentName}`,
    `Date: ${formatLongDate(lesson.date)} · ${lesson.time}–${lesson.endTime}`,
    `Assigned by: ${material.assignedBy} on ${formatLongDate(material.assignedAt)}`,
    "",
    material.summary,
    "",
    ...material.sections.flatMap((section) => [section.heading, ...section.items.map((item) => `- ${item}`), ""]),
  ].join("\n");
}

type LessonsProps = {
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  closedSlots: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  onAddLesson: (input: AddTeacherLessonInput) => ServiceCall<unknown>;
  onRequestLessonCancellation: (id: string, input: CancelLessonRequestInput) => ServiceCall<unknown>;
  onWithdrawLessonCancellationRequest: (id: string) => ServiceCall<unknown>;
  onCompleteLesson: (id: string, input: CompleteLessonInput) => ServiceCall<unknown>;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const tabs = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

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

export default function TeacherLessons({ lessons, students, closedSlots, openedSlots, onAddLesson, onRequestLessonCancellation, onWithdrawLessonCancellationRequest, onCompleteLesson, onNavigate, onNotice }: LessonsProps) {
  const onTheSpotHours = useSchool(performanceRules).onTheSpotHours;
  function openTimesForDate(date: string, excludedLessonId?: string) {
    return buildDaySlots({ date, closures: closedSlots, openedSlots, lessons, excludedLessonId, includeClosed: false })
      .map((slot) => slot.time);
  }

  const initialDate = isoDaysFromNow(1);
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("upcoming");
  const [query, setQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelIsOnTheSpot, setCancelIsOnTheSpot] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("Schedule conflict");
  const [cancelComment, setCancelComment] = useState("");
  const [cancelAttachment, setCancelAttachment] = useState<TeacherLessonAttachment | undefined>();
  const [addForm, setAddForm] = useState({
    studentId: students[0]?.id ?? "",
    title: teacherFocusOptions[0],
    date: initialDate,
    time: openTimesForDate(initialDate)[0] ?? "",
    notes: "",
  });
  const [completeForm, setCompleteForm] = useState<CompleteLessonInput>({ attendance: "attended", feedback: "", homework: "" });

  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? null;
  const cancelTarget = lessons.find((lesson) => lesson.id === cancelId) ?? null;
  const completeTarget = lessons.find((lesson) => lesson.id === completeId) ?? null;

  const addSlots = useMemo(
    () => buildDaySlots({ date: addForm.date, closures: closedSlots, openedSlots, lessons, includeClosed: false }),
    [addForm.date, closedSlots, openedSlots, lessons],
  );
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

  function openAdd() {
    const time = openTimesForDate(initialDate)[0] ?? "";
    setAddForm({
      studentId: students[0]?.id ?? "",
      title: teacherFocusOptions[0],
      date: initialDate,
      time,
      notes: "",
    });
    setAddOpen(true);
  }

  function handleAddDate(date: string) {
    const times = openTimesForDate(date);
    setAddForm((current) => ({
      ...current,
      date,
      time: times.includes(current.time) ? current.time : times[0] ?? "",
    }));
  }

  async function submitAdd(event: FormEvent<HTMLFormElement>) {
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
    if (!addForm.time || !addSlots.some((slot) => slot.time === addForm.time)) {
      onNotice("Choose an open 25-minute slot for this lesson.");
      return;
    }
    const result = await onAddLesson({
      studentId: student.id,
      date: addForm.date,
      time: addForm.time,
      duration: LESSON_SLOT_MINUTES,
      title: addForm.title,
      focus: [addForm.title.split(" ")[0], "Tutoring"],
      notes: addForm.notes.trim() || `Focus on ${addForm.title.toLowerCase()} with ${student.name}.`,
    });
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setAddOpen(false);
    setTab("upcoming");
    onNotice(`${addForm.title} scheduled with ${student.name} for ${formatLessonDate(addForm.date)} at ${addForm.time}.`);
  }

  function openCancel(lesson: TeacherLesson) {
    setCancelReason("Schedule conflict");
    setCancelComment("");
    setCancelAttachment(undefined);
    setSelectedId(null);
    setCancelIsOnTheSpot(slotStartDate(lesson.date, lesson.time).getTime() - Date.now() < onTheSpotHours * 3_600_000);
    setCancelId(lesson.id);
  }

  function handleCancelAttachment(file: File | undefined) {
    if (!file) {
      setCancelAttachment(undefined);
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      onNotice("Attach an image or PDF as supporting evidence.");
      return;
    }
    if (file.size > 1_500_000) {
      onNotice("Attachment must be 1.5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCancelAttachment({ name: file.name, type: file.type, dataUrl: reader.result });
      }
    };
    reader.onerror = () => onNotice("Could not read that attachment. Try another file.");
    reader.readAsDataURL(file);
  }

  async function submitCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    const comment = cancelComment.trim();
    if (comment.length < 10) {
      onNotice("Add a short comment explaining why this lesson needs to be cancelled.");
      return;
    }
    if (!cancelAttachment) {
      onNotice("Attach an image or PDF as supporting evidence for the cancellation.");
      return;
    }
    const result = await onRequestLessonCancellation(cancelTarget.id, { reason: cancelReason.trim(), comment, attachment: cancelAttachment });
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setCancelId(null);
    onNotice("Cancellation request sent to your manager for approval.");
  }

  function openComplete(lesson: TeacherLesson) {
    setCompleteForm({ attendance: "attended", feedback: "", homework: lesson.homework ?? "" });
    setSelectedId(null);
    setCompleteId(lesson.id);
  }

  async function submitComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completeTarget) return;
    const result = await onCompleteLesson(completeTarget.id, completeForm);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setCompleteId(null);
    setSelectedId(null);
    setTab("completed");
    onNotice(completeForm.attendance === "attended" ? `${completeTarget.title} marked complete.` : `${completeTarget.title} marked as a no-show.`);
  }

  async function downloadMaterial(lesson: TeacherLesson, material: TeacherLessonMaterial) {
    if (material.attachment) {
      try {
        if (!(await downloadAttachmentFile(material.attachment))) {
          onNotice(`${material.attachment.name} is not available on this device yet.`);
          return;
        }
      } catch {
        onNotice(`Could not download ${material.attachment.name}. Try again.`);
        return;
      }
    } else {
      downloadTextFile(material.fileName, lessonMaterialText(lesson, material));
    }
    onNotice(`Downloaded "${material.title}".`);
  }

  async function downloadPlanFile(file: NonNullable<TeacherLessonMaterial["files"]>[number]) {
    try {
      if (await downloadAttachmentFile(file)) onNotice(`Downloaded ${file.name}.`);
      else onNotice(`${file.name} is not available on this device yet.`);
    } catch {
      onNotice(`Could not download ${file.name}. Try again.`);
    }
  }

  function joinLesson(lesson: TeacherLesson) {
    onNotice(`Classroom ${lesson.roomCode} is open. You can join ${lesson.studentName}'s lesson in advance.`);
  }

  async function withdrawCancellation(lesson: TeacherLesson) {
    const result = await onWithdrawLessonCancellationRequest(lesson.id);
    onNotice(result.ok ? `Cancellation request for ${lesson.title} withdrawn.` : result.error);
  }

  function attachmentPreview(attachment: TeacherLessonAttachment) {
    const isImage = attachment.type.startsWith("image/");
    if (!attachment.dataUrl) {
      return <div className="lesson-detail-section">
        <span className="eyebrow">ATTACHMENT</span>
        <button type="button" className="icon-text-button" onClick={async () => {
          try {
            if (!(await downloadAttachmentFile(attachment))) onNotice(`${attachment.name} is not available on this device yet.`);
          } catch {
            onNotice(`Could not download ${attachment.name}. Try again.`);
          }
        }}><Icon name="file" size={14} /> {attachment.name}</button>
      </div>;
    }
    return <div className="lesson-detail-section">
      <span className="eyebrow">ATTACHMENT</span>
      {isImage
        ? <a href={attachment.dataUrl} target="_blank" rel="noreferrer"><Image src={attachment.dataUrl} alt={attachment.name} width={220} height={150} unoptimized style={{ width: 220, height: 150, objectFit: "contain", borderRadius: 8 }} /></a>
        : <a href={attachment.dataUrl} download={attachment.name}><Icon name="file" size={14} /> {attachment.name}</a>}
    </div>;
  }

  function statusPill(lesson: TeacherLesson) {
    return <span className={`teacher-lesson-status ${lesson.status}`}>{statusLabels[lesson.status]}</span>;
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHING LESSONS</p><h1>Lessons</h1><p className="subheading">Join live classrooms in advance and review lesson reports.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Booking slots")}><Icon name="clock" size={15} /> Booking slots</button>
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
      <div className="panel-header"><div><h2>Lessons</h2><p>Booked sessions, reports, and classroom actions</p></div></div>
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
              <small>{lesson.studentName}</small>
              <div className="lesson-tags">{lesson.focus.map((focus) => <span key={focus}>{focus}</span>)}</div>
            </div>
          </button>
          <div className="lesson-card-actions">
            {lesson.status === "scheduled" && <>
              <button type="button" className="secondary-button compact-button" onClick={() => setSelectedId(lesson.id)}><Icon name="file" size={14} /> View</button>
              {lesson.cancellation?.status === "pending" && <span className="teacher-slot-badge pending">Cancellation pending</span>}
            </>}
            {lesson.status === "live" && <>
              {canJoinLesson(lesson)
                ? <button type="button" className="primary-button compact-button" onClick={() => joinLesson(lesson)}><Icon name="video" size={14} /> Join</button>
                : <button type="button" className="secondary-button compact-button" onClick={() => setSelectedId(lesson.id)}><Icon name="file" size={14} /> View</button>}
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

    {selected && <StudentModal eyebrow="LESSON DETAILS" title={selected.title} description={`${selected.studentName} · ${formatLongDate(selected.date)} · ${selected.time}–${selected.endTime}`} onClose={() => setSelectedId(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedId(null)}>Close</button>
        {selected.status === "scheduled" && <>
          {selected.cancellation?.status === "pending"
            ? <button type="button" className="danger-outline-button" onClick={() => { withdrawCancellation(selected); setSelectedId(null); }}>Withdraw request</button>
            : <button type="button" className="danger-outline-button" onClick={() => openCancel(selected)}>Request cancellation</button>}
          {canJoinLesson(selected) && <button type="button" className="primary-button" onClick={() => joinLesson(selected)}>Join classroom</button>}
        </>}
        {selected.status === "live" && <>
          <button type="button" className="secondary-button" onClick={() => openComplete(selected)}>Mark complete</button>
          {canJoinLesson(selected) && <button type="button" className="primary-button" onClick={() => joinLesson(selected)}>Join classroom</button>}
        </>}
        {selected.status === "completed" && <button type="button" className="secondary-button" onClick={() => openComplete(selected)}>Update report</button>}
      </>}>
      <div className="lesson-detail-grid">
        <div><span className="lesson-detail-icon"><Icon name="user" size={15} /></span><span className="lesson-detail-copy"><span className="eyebrow">STUDENT</span><strong>{selected.studentName}</strong></span></div>
        <div><span className="lesson-detail-icon"><Icon name="calendar" size={15} /></span><span className="lesson-detail-copy"><span className="eyebrow">DATE</span><strong>{formatLessonDate(selected.date)}</strong></span></div>
        <div><span className="lesson-detail-icon"><Icon name="clock" size={15} /></span><span className="lesson-detail-copy"><span className="eyebrow">TIME</span><strong>{selected.time}–{selected.endTime}</strong></span></div>
        <div><span className="lesson-detail-icon"><Icon name="video" size={15} /></span><span className="lesson-detail-copy"><span className="eyebrow">ROOM</span><strong>{selected.roomCode ?? "Not assigned"}</strong></span></div>
      </div>
      {selected.material
        ? <div className="lesson-material">
          <span className="lesson-material-icon"><Icon name="file" size={18} /></span>
          <div className="lesson-material-copy">
            <span className="eyebrow">LESSON MATERIAL · ASSIGNED BY MANAGER</span>
            <strong>{selected.material.title}</strong>
            <small>{selected.material.position && selected.material.courseTitle ? `Plan ${selected.material.position} of ${selected.material.total} · ${selected.material.courseTitle}` : selected.material.fileName} · {selected.material.assignedBy} · {formatLessonDate(selected.material.assignedAt)}</small>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={() => downloadMaterial(selected, selected.material!)}><Icon name="download" size={14} /> Plan</button>
          {selected.material.files && selected.material.files.length > 0 && <div className="lesson-material-files">
            {selected.material.files.map((file) => <button type="button" className="lesson-material-file" key={file.id} onClick={() => void downloadPlanFile(file)}>
              <Icon name="file" size={14} /><span>{file.name}</span><small>{file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</small><Icon name="download" size={14} />
            </button>)}
          </div>}
        </div>
        : <div className="lesson-material empty">
          <span className="lesson-material-icon"><Icon name="file" size={18} /></span>
          <div className="lesson-material-copy">
            <span className="eyebrow">LESSON MATERIAL</span>
            <strong>No material assigned yet</strong>
            <small>Your manager will attach the lesson plan before class.</small>
          </div>
        </div>}
      <div className="lesson-detail-section"><span className="eyebrow">FOCUS</span><div className="lesson-tags">{selected.focus.map((focus) => <span key={focus}>{focus}</span>)}</div></div>
      {selected.notes && <div className="lesson-detail-section"><span className="eyebrow">LESSON NOTES</span><p>{selected.notes}</p></div>}
      {selected.attendance && <div className="lesson-detail-section"><span className="eyebrow">ATTENDANCE</span><p>{selected.attendance === "attended" ? "Attended" : "No-show"}</p></div>}
      {selected.feedback && <div className="lesson-detail-section"><span className="eyebrow">TEACHER FEEDBACK</span><blockquote>{selected.feedback}</blockquote></div>}
      {selected.homework && <div className="lesson-callout"><Icon name="book" size={16} /><div><strong>Homework assigned</strong><p>{selected.homework}</p></div></div>}
      {selected.cancellation && <div className={`lesson-callout ${selected.cancellation.status === "rejected" ? "warning" : ""}`}>
        <Icon name={selected.cancellation.status === "rejected" ? "x" : "clock"} size={16} />
        <div>
          <strong>{selected.cancellation.status === "pending" ? "Cancellation awaiting manager approval" : selected.cancellation.status === "approved" ? "Cancellation approved" : "Cancellation request declined"}</strong>
          <p>{selected.cancellation.reason} · {selected.cancellation.comment}</p>
          {selected.cancellation.reviewNote && <p><strong>Manager note:</strong> {selected.cancellation.reviewNote}</p>}
        </div>
      </div>}
      {selected.cancellation?.attachment && attachmentPreview(selected.cancellation.attachment)}
      {!selected.cancellation && selected.status === "cancelled" && <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Cancellation note</strong><p>{selected.cancelReason ?? "This lesson was cancelled."}</p></div></div>}
    </StudentModal>}

    {addOpen && <StudentModal eyebrow="SCHEDULE A SESSION" title="Add a lesson" description="Create a 25-minute session in one of your open slots." onClose={() => setAddOpen(false)}
      footer={<><button type="button" className="cancel-button" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" form="add-teacher-lesson-form" className="primary-button" disabled={addSlots.length === 0}><Icon name="calendarAdd" size={15} /> Confirm lesson</button></>}>
      <form id="add-teacher-lesson-form" className="student-form-grid" onSubmit={submitAdd}>
        <label>Student<select value={addForm.studentId} onChange={(event) => setAddForm({ ...addForm, studentId: event.target.value })}>{students.map((student) => <option value={student.id} key={student.id}>{student.name} — {student.level}</option>)}</select></label>
        <label>Lesson focus<select value={addForm.title} onChange={(event) => setAddForm({ ...addForm, title: event.target.value })}>{teacherFocusOptions.map((focus) => <option value={focus} key={focus}>{focus}</option>)}</select></label>
        <label>Date<input type="date" min={today} value={addForm.date} onChange={(event) => handleAddDate(event.target.value)} required /></label>
        <label>Start time<select value={addForm.time} onChange={(event) => setAddForm({ ...addForm, time: event.target.value })} disabled={addSlots.length === 0}>{addSlots.map((slot) => <option value={slot.time} key={slot.time}>{slot.time}–{slot.endTime}</option>)}{addSlots.length === 0 && <option value="">No open slots</option>}</select></label>
        <div className="booking-summary full-field"><Icon name="clock" size={16} /><span>{formatLessonDate(addForm.date)} · {addForm.time ? `${addForm.time}–${addSlots.find((slot) => slot.time === addForm.time)?.endTime ?? ""}` : "Choose an open slot"} · 25 minutes</span></div>
        <label className="full-field">Notes<textarea rows={3} value={addForm.notes} onChange={(event) => setAddForm({ ...addForm, notes: event.target.value })} placeholder="What should the student prepare?" /></label>
      </form>
    </StudentModal>}

    {cancelTarget && <StudentModal eyebrow="CANCELLATION REQUEST" title={`Request cancellation of ${cancelTarget.title}?`} description="Your manager needs to approve this before the lesson is cancelled." onClose={() => setCancelId(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setCancelId(null)}>Keep lesson</button><button type="submit" form="teacher-cancel-form" className="danger-button" disabled={cancelComment.trim().length < 10 || !cancelAttachment}>Send request</button></>}>
      <form id="teacher-cancel-form" className="student-form-grid" onSubmit={submitCancel}>
        {cancelIsOnTheSpot && <div className="lesson-callout warning full-field"><Icon name="clock" size={16} /><div><strong>On-the-spot cancellation</strong><p>This lesson starts in less than {onTheSpotHours} hours. If your manager approves it, {Math.abs(ON_THE_SPOT_CANCELLATION_POINTS)} points come off your performance score.</p></div></div>}
        <label>Reason<select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option>Schedule conflict</option><option>Student requested a change</option><option>Teacher unavailable</option><option>Technical issue</option><option>Other</option></select></label>
        <label className="full-field">Comment<textarea rows={3} value={cancelComment} onChange={(event) => setCancelComment(event.target.value)} placeholder="Explain what happened and why this lesson cannot go ahead. At least 10 characters." required minLength={10} autoFocus /></label>
        <label className="full-field">Supporting attachment (image or PDF)<input type="file" accept="image/*,application/pdf" onChange={(event) => handleCancelAttachment(event.target.files?.[0])} /></label>
        {cancelAttachment && <div className="booking-summary full-field">
          {cancelAttachment.dataUrl && cancelAttachment.type.startsWith("image/")
            ? <Image src={cancelAttachment.dataUrl} alt={cancelAttachment.name} width={40} height={40} unoptimized style={{ objectFit: "cover", borderRadius: 6 }} />
            : <Icon name="file" size={16} />}
          <span>{cancelAttachment.name}</span>
          <button type="button" className="icon-text-button" onClick={() => setCancelAttachment(undefined)}><Icon name="x" size={14} /> Remove</button>
        </div>}
        <div className="lesson-callout warning full-field"><Icon name="clock" size={16} /><div><strong>Manager approval required</strong><p>The lesson stays scheduled until your manager approves the request. You can withdraw it any time before then.</p></div></div>
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
