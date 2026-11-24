"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { PlanPickerModal } from "./CurriculumForms";
import { LibraryPickerModal } from "./LibraryForms";
import { AbsenceModal } from "./PeopleForms";
import { LessonStatusBadge } from "./parts";
import { teacherFocusOptions } from "../../lib/data";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  activeCourseProgress,
  attachablePlans,
  can,
  creditBalance,
  enrollmentsForStudent,
  libraryForLesson,
  openSlotsForTeacher,
  studentsForUser,
  teachersForUser,
  teamWeekView,
  weekStartFor,
  type SchoolData,
  type SchoolUser,
  type TeamWeekItem,
} from "../../lib/school";
import { assignPlanToLesson, bookLessonOnBehalf, detachLibraryItem, recordTeacherAbsence, LESSON_CREDIT_HOURS } from "../../lib/school/services";
import { formatLessonDate, parseISODate, todayISO } from "../../lib/student";

type LessonItem = Extract<TeamWeekItem, { kind: "lesson" }>;
type BookingDraft = { teacherId: string; date: string; time: string };
type Dialog = { kind: "lesson"; item: LessonItem } | { kind: "plan"; item: LessonItem } | { kind: "library"; item: LessonItem } | { kind: "absence"; item: LessonItem } | { kind: "book"; draft: BookingDraft } | null;

function dayLabel(date: string) {
  return parseISODate(date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function weekLabel(start: string) {
  const first = parseISODate(start);
  const last = parseISODate(start);
  last.setDate(last.getDate() + 6);
  const format = (value: Date) => value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(first)} – ${format(last)}, ${last.getFullYear()}`;
}

/** Book an open slot for a student. Students enrolled with the chosen teacher are listed first. */
function BookOnBehalfModal({ user, initial, teachers, onBooked, onClose }: {
  user: SchoolUser;
  initial: BookingDraft;
  teachers: SchoolUser[];
  onBooked: (message: string) => void;
  onClose: () => void;
}) {
  const [teacherId, setTeacherId] = useState(initial.teacherId);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [title, setTitle] = useState(teacherFocusOptions[0]);
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");

  const select = useCallback((data: SchoolData) => {
    const students = studentsForUser(data, user).filter((student) => student.status === "active").map((student) => ({
      student,
      enrolledHere: enrollmentsForStudent(data, student.id).some((enrollment) => enrollment.status === "active" && enrollment.teacherId === teacherId),
      credits: creditBalance(data, student.id),
    })).sort((a, b) => Number(b.enrolledHere) - Number(a.enrolledHere) || a.student.name.localeCompare(b.student.name));
    return { students, slots: teacherId && date ? openSlotsForTeacher(data, teacherId, date) : [] };
  }, [user, teacherId, date]);
  const { students, slots } = useSchool(select);
  const chosenStudent = students.find((row) => row.student.id === studentId) ?? students[0];
  const chosenTime = slots.some((slot) => slot.time === time) ? time : slots[0]?.time ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosenStudent) return setError("No active students on your team.");
    if (!chosenTime) return setError("Choose a day with an open slot.");
    const result = await bookLessonOnBehalf(user.id, { teacherId, studentId: chosenStudent.student.id, date, time: chosenTime, title, focus: [title.split(" ")[0], "Tutoring"] });
    if (!result.ok) return setError(result.error);
    onBooked(`${title} booked for ${chosenStudent.student.name} with ${teachers.find((teacher) => teacher.id === teacherId)?.name} on ${formatLessonDate(date)} at ${chosenTime}.`);
    onClose();
  }

  return <Modal eyebrow="BOOK ON BEHALF" title="Book a lesson for a student" description="Uses the student's credits and attaches the next plan from their course." onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form="book-behalf-form" className="primary-button" disabled={!chosenTime || !chosenStudent}><Icon name="calendarAdd" size={14} /> Book lesson</button></>}>
    <form id="book-behalf-form" className="student-form-grid" onSubmit={submit} noValidate>
      <label>Teacher<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{teachers.filter((teacher) => teacher.status === "active").map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
      <label>Student<select value={chosenStudent?.student.id ?? ""} onChange={(event) => setStudentId(event.target.value)}>
        {students.map((row) => <option key={row.student.id} value={row.student.id}>{row.student.name}{row.enrolledHere ? " (enrolled)" : ""}</option>)}
      </select></label>
      <label>Date<input type="date" min={todayISO()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Open slot<select value={chosenTime} onChange={(event) => setTime(event.target.value)} disabled={slots.length === 0}>
        {slots.map((slot) => <option key={slot.time} value={slot.time}>{slot.time}–{slot.endTime}</option>)}
        {slots.length === 0 && <option value="">No open slots this day</option>}
      </select></label>
      <label className="full-field">Lesson focus<select value={title} onChange={(event) => setTitle(event.target.value)}>{teacherFocusOptions.map((focus) => <option key={focus} value={focus}>{focus}</option>)}</select></label>
      {chosenStudent && <p className={`student-form-note full-field ${chosenStudent.credits < LESSON_CREDIT_HOURS ? "manager-low" : ""}`}>{chosenStudent.student.name} has {chosenStudent.credits.toFixed(2)} credit hours{chosenStudent.credits < LESSON_CREDIT_HOURS ? " (not enough for a lesson; add credits first)" : ""}.</p>}
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}

export default function ManagerSchedule({ user, onNotice }: { user: SchoolUser; onNotice: (message: string) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = todayISO();
  const weekStart = weekStartFor(today, weekOffset);

  const selectTeachers = useCallback((data: SchoolData) => teachersForUser(data, user), [user]);
  const teachers = useSchool(selectTeachers);
  const teacherIds = useMemo(() => (teacherFilter === "all" ? teachers.map((teacher) => teacher.id) : [teacherFilter]), [teacherFilter, teachers]);
  const selectWeek = useCallback((data: SchoolData) => teamWeekView(data, teacherIds, weekStart, teacherFilter !== "all"), [teacherIds, weekStart, teacherFilter]);
  const days = useSchool(selectWeek);
  const selectPlans = useCallback((data: SchoolData) => attachablePlans(data, user), [user]);
  const planGroups = useSchool(selectPlans);
  const selectExtras = useCallback((data: SchoolData) => {
    const lesson = dialog && dialog.kind !== "book" ? dialog.item.lesson : undefined;
    return {
      preferredCourseId: lesson ? activeCourseProgress(data, lesson.studentId)?.courseId : undefined,
      canManage: lesson ? can(data, user, "lesson.attachPlan", { lessonId: lesson.id }) : false,
      canAttachLibrary: lesson ? can(data, user, "lesson.attachLibraryItem", { lessonId: lesson.id }) : false,
      materials: lesson ? libraryForLesson(data, lesson.id) : [],
    };
  }, [dialog, user]);
  const extras = useSchool(selectExtras);

  const totals = days.reduce((sum, day) => ({ lessons: sum.lessons + day.lessonCount, open: sum.open + day.openCount }), { lessons: 0, open: 0 });
  const defaultTeacher = teacherFilter !== "all" ? teacherFilter : teachers.find((teacher) => teacher.status === "active")?.id ?? "";

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{user.role === "admin" ? "SCHOOL SCHEDULE" : "TEAM SCHEDULE"}</p>
        <h1>Schedule</h1>
        <p className="subheading">Every lesson on {user.role === "admin" ? "the school's" : "your team's"} calendar. Pick a teacher to see their open slots and book for a student.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="primary-button" disabled={!defaultTeacher} onClick={() => setDialog({ kind: "book", draft: { teacherId: defaultTeacher, date: weekOffset === 0 ? today : weekStart, time: "" } })}><Icon name="calendarAdd" size={15} /> Book a lesson</button>
      </div>
    </section>

    <section className="panel student-panel">
      <div className="schedule-toolbar">
        <div className="schedule-week-nav">
          <button type="button" className="icon-button bordered" aria-label="Previous week" onClick={() => setWeekOffset((value) => value - 1)}><Icon name="chevronLeft" size={16} /></button>
          <button type="button" className="secondary-button compact-button" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Today</button>
          <button type="button" className="icon-button bordered" aria-label="Next week" onClick={() => setWeekOffset((value) => value + 1)}><Icon name="chevronRight" size={16} /></button>
          <strong>{weekLabel(weekStart)}</strong>
        </div>
        <label className="student-select"><Icon name="filter" size={15} /><select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} aria-label="Teacher">
          <option value="all">All teachers</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.status !== "active" ? " (paused)" : ""}</option>)}
        </select></label>
        <span className="student-filter-count">{totals.lessons} lesson{totals.lessons === 1 ? "" : "s"} · {totals.open} open slot{totals.open === 1 ? "" : "s"}</span>
      </div>

      <div className="schedule-week">
        {days.map((day) => <div className={`schedule-day ${day.date === today ? "is-today" : ""} ${day.date < today ? "is-past" : ""}`} key={day.date}>
          <div className="schedule-day-head"><strong>{dayLabel(day.date)}</strong><small>{day.lessonCount} lesson{day.lessonCount === 1 ? "" : "s"}</small></div>
          <div className="schedule-day-items">
            {day.items.map((item) => item.kind === "lesson"
              ? <button type="button" key={item.lesson.id} className={`schedule-item lesson status-${item.lesson.status}`} onClick={() => setDialog({ kind: "lesson", item })}>
                <span className="schedule-item-time">{item.time}</span>
                <strong>{item.lesson.title}</strong>
                <small title={`${item.teacherName} → ${item.studentName}`}>{teacherFilter === "all" ? `${item.teacherName.split(" ")[0]} → ` : ""}{item.studentName}</small>
              </button>
              : <button type="button" key={`${item.teacherId}-${item.time}`} className="schedule-item open" onClick={() => setDialog({ kind: "book", draft: { teacherId: item.teacherId, date: day.date, time: item.time } })}>
                <span className="schedule-item-time">{item.time}</span>
                <strong>Open</strong>
                <small><Icon name="plus" size={11} /> Book for a student</small>
              </button>)}
            {day.items.length === 0 && <p className="schedule-empty">{teacherFilter === "all" && day.openCount ? "No lessons" : "Nothing scheduled"}</p>}
            {teacherFilter === "all" && day.openCount > 0 && <p className="schedule-open-count">{day.openCount} open slot{day.openCount === 1 ? "" : "s"} · pick a teacher to book</p>}
          </div>
        </div>)}
      </div>
    </section>

    {dialog?.kind === "lesson" && <Modal eyebrow={dialog.item.lesson.status.toUpperCase()} title={dialog.item.lesson.title} description={`${formatLessonDate(dialog.item.lesson.date)} · ${dialog.item.time}–${dialog.item.endTime} · Room ${dialog.item.lesson.roomCode ?? "—"}`} onClose={() => setDialog(null)}
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setDialog(null)}>Close</button>
        {extras.canManage && dialog.item.started && dialog.item.lesson.status !== "cancelled" && !dialog.item.hasAbsence && <button type="button" className="danger-outline-button" onClick={() => setDialog({ kind: "absence", item: dialog.item })}>Record absence</button>}
        {extras.canAttachLibrary && (dialog.item.lesson.status === "scheduled" || dialog.item.lesson.status === "live") && <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "library", item: dialog.item })}><Icon name="book" size={14} /> Materials</button>}
        {extras.canManage && (dialog.item.lesson.status === "scheduled" || dialog.item.lesson.status === "live") && <button type="button" className="primary-button" onClick={() => setDialog({ kind: "plan", item: dialog.item })}>Change plan</button>}
      </>}>
      <div className="manager-detail-stats schedule-lesson-stats">
        <div><span className="eyebrow">TEACHER</span><strong>{dialog.item.teacherName}</strong></div>
        <div><span className="eyebrow">STUDENT</span><strong>{dialog.item.studentName}</strong></div>
        <div><span className="eyebrow">STATUS</span><LessonStatusBadge status={dialog.item.lesson.status} /></div>
      </div>
      <div className="lesson-detail-section"><span className="eyebrow">LESSON PLAN</span><p>{dialog.item.planTitle ?? "No plan attached."}</p></div>
      {extras.materials.length > 0 && <div className="lesson-detail-section" data-testid="manager-lesson-materials"><span className="eyebrow">LIBRARY MATERIALS</span>
        <div className="manager-mini-list">
          {extras.materials.map((item) => <div key={item.id}><strong>{item.title}<small className="manager-plan-line">{item.category}{item.status === "archived" ? " · archived" : ""}</small></strong>
            {extras.canAttachLibrary && <button type="button" className="secondary-button compact-button" aria-label={`Remove ${item.title}`} onClick={async () => {
              const result = await detachLibraryItem(user.id, dialog.item.lesson.id, item.id);
              onNotice(result.ok ? `${item.title} removed from the lesson.` : result.error);
            }}>Remove</button>}
          </div>)}
        </div>
      </div>}
      {dialog.item.lesson.cancelReason && <div className="lesson-detail-section"><span className="eyebrow">CANCELLATION</span><p>{dialog.item.lesson.cancelReason}</p></div>}
      {dialog.item.lesson.feedback && <div className="lesson-detail-section"><span className="eyebrow">TEACHER FEEDBACK</span><p>{dialog.item.lesson.feedback}</p></div>}
    </Modal>}

    {dialog?.kind === "plan" && <PlanPickerModal
      lessonLabel={`${dialog.item.lesson.title} · ${dialog.item.teacherName} → ${dialog.item.studentName} · ${formatLessonDate(dialog.item.lesson.date)} ${dialog.item.time}`}
      groups={planGroups} currentPlanId={dialog.item.lesson.lessonPlanId} preferredCourseId={extras.preferredCourseId}
      onClose={() => setDialog(null)}
      onSubmit={async (planId) => {
        const result = await assignPlanToLesson(user.id, dialog.item.lesson.id, planId);
        if (result.ok) onNotice(planId ? "Plan updated. The teacher and student see it now." : "Plan removed from the lesson.");
        return result;
      }} />}
    {dialog?.kind === "library" && <LibraryPickerModal user={user} lessonId={dialog.item.lesson.id}
      lessonLabel={`${dialog.item.lesson.title} · ${dialog.item.teacherName} → ${dialog.item.studentName} · ${formatLessonDate(dialog.item.lesson.date)} ${dialog.item.time}`}
      lessonOpen={dialog.item.lesson.status === "scheduled" || dialog.item.lesson.status === "live"}
      onNotice={onNotice} onClose={() => setDialog({ kind: "lesson", item: dialog.item })} />}
    {dialog?.kind === "absence" && <AbsenceModal lessonLabel={`${dialog.item.lesson.title} · ${dialog.item.teacherName} → ${dialog.item.studentName} · ${formatLessonDate(dialog.item.lesson.date)} ${dialog.item.time}`}
      onClose={() => setDialog(null)}
      onSubmit={async (note) => {
        const result = await recordTeacherAbsence(user.id, dialog.item.lesson.id, note);
        if (result.ok) onNotice("Absence recorded. The lesson is cancelled and the student refunded.");
        return result;
      }} />}
    {dialog?.kind === "book" && <BookOnBehalfModal user={user} initial={dialog.draft} teachers={teachers} onBooked={onNotice} onClose={() => setDialog(null)} />}
  </div>;
}
