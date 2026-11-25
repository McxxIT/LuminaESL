"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import type { ServiceCall } from "../../lib/school/services";
import StudentModal from "../student/StudentModal";
import {
  buildDaySlots,
  formatSlotTiming,
  formatTimestamp,
  isSlotInPast,
  type DaySlot,
} from "../../lib/scheduling";
import {
  formatLessonDate,
  formatLongDate,
  initials,
  parseISODate,
  toISODate,
  todayISO,
} from "../../lib/student";
import type {
  TeacherLesson,
  TeacherSlotClosure,
  TeacherSlotOpening,
} from "../../lib/types";

type BookingSlotsProps = {
  lessons: TeacherLesson[];
  closedSlots: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  onRequestSlotClosure: (date: string, time: string, reason: string) => ServiceCall<unknown>;
  onCancelSlotClosureRequest: (date: string, time: string) => ServiceCall<unknown>;
  onOpenSlot: (date: string, time: string) => ServiceCall<unknown>;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const slotFilters = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "booked", label: "Booked" },
  { key: "pending", label: "Pending approval" },
  { key: "closed", label: "Closed" },
] as const;

type SlotFilter = (typeof slotFilters)[number]["key"];

function withinLastDays(date: string, days: number) {
  const diff = (parseISODate(todayISO()).getTime() - parseISODate(date).getTime()) / 86_400_000;
  return diff >= 0 && diff < days;
}

export default function TeacherBookingSlots({ lessons, closedSlots, openedSlots, onRequestSlotClosure, onCancelSlotClosureRequest, onOpenSlot, onNavigate, onNotice }: BookingSlotsProps) {
  const [slotDate, setSlotDate] = useState(todayISO());
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [closureTarget, setClosureTarget] = useState<DaySlot | null>(null);
  const [closureReason, setClosureReason] = useState("Medical appointment");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const daySlots = useMemo(
    () => buildDaySlots({ date: slotDate, closures: closedSlots, openedSlots, lessons, includeClosed: true }),
    [slotDate, closedSlots, openedSlots, lessons],
  );
  const slotCounts = useMemo(() => ({
    all: daySlots.length,
    open: daySlots.filter((slot) => slot.status === "open").length,
    booked: daySlots.filter((slot) => slot.status === "booked").length,
    pending: daySlots.filter((slot) => slot.status === "pending").length,
    closed: daySlots.filter((slot) => slot.status === "closed").length,
  }), [daySlots]);
  const visibleSlots = useMemo(
    () => slotFilter === "all" ? daySlots : daySlots.filter((slot) => slot.status === slotFilter),
    [daySlots, slotFilter],
  );

  const today = todayISO();
  const todaysLessons = lessons.filter((lesson) => lesson.date === today);
  const upcomingCount = lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "live").length;
  const completedCount = lessons.filter((lesson) => lesson.status === "completed").length;
  const weeklyHours = lessons
    .filter((lesson) => lesson.status === "completed" && withinLastDays(lesson.date, 7))
    .reduce((total, lesson) => total + lesson.duration / 60, 0);

  function shiftSlotDate(offset: number) {
    const date = parseISODate(slotDate);
    date.setDate(date.getDate() + offset);
    setSlotDate(toISODate(date));
  }

  function openClosureRequest(slot: DaySlot) {
    setClosureReason("Medical appointment");
    setClosureTarget(slot);
  }

  async function submitClosureRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closureTarget) return;
    const reason = closureReason.trim();
    if (reason.length < 3) {
      onNotice("Add a short reason for closing this slot.");
      return;
    }
    const result = await onRequestSlotClosure(slotDate, closureTarget.time, reason);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setClosureTarget(null);
    onNotice(`Closure request for ${formatLessonDate(slotDate)} ${closureTarget.time}–${closureTarget.endTime} sent to your manager.`);
  }

  async function withdrawClosureRequest(slot: DaySlot) {
    const result = await onCancelSlotClosureRequest(slotDate, slot.time);
    onNotice(result.ok ? `${slot.time}–${slot.endTime} closure request withdrawn. The slot is open for booking again.` : result.error);
  }

  async function openSlot(slot: DaySlot) {
    if (isSlotInPast(slotDate, slot.time, now)) {
      onNotice("This slot is in the past and can no longer be opened for booking.");
      return;
    }
    const result = await onOpenSlot(slotDate, slot.time);
    onNotice(result.ok ? `${slot.time}–${slot.endTime} opened for bookings. No approval needed.` : result.error);
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHER AVAILABILITY</p><h1>Booking slots</h1><p className="subheading">Slots stay closed until you open them. Opening is instant; closing a slot needs manager approval.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => setSlotDate(today)}><Icon name="clock" size={15} /> Today&apos;s bookings</button>
        <button type="button" className="primary-button" onClick={() => onNavigate("Lessons")}><Icon name="video" size={15} /> View lessons</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="calendar" /></span><div><span>TODAY</span><strong>{todaysLessons.length}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="clock" /></span><div><span>UPCOMING</span><strong>{upcomingCount}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>COMPLETED</span><strong>{completedCount}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="zap" /></span><div><span>HOURS THIS WEEK</span><strong>{weeklyHours.toFixed(1)} <em>hrs</em></strong></div></article>
    </section>

    <section className="panel student-panel teacher-slot-panel">
      <div className="panel-header">
        <div><h2>Booking slots</h2><p>{formatLongDate(slotDate)} · 08:00–23:30 daily · 25 min classes with 5 min breaks · closed until opened</p></div>
        <div className="teacher-slot-toolbar">
          <div className="teacher-slot-nav">
            <button type="button" aria-label="Previous day" onClick={() => shiftSlotDate(-1)}>‹</button>
            <button type="button" className="teacher-slot-today" onClick={() => setSlotDate(today)}>Today</button>
            <button type="button" aria-label="Next day" onClick={() => shiftSlotDate(1)}>›</button>
          </div>
          <label className="teacher-slot-date"><Icon name="calendar" size={15} /><input type="date" value={slotDate} onChange={(event) => setSlotDate(event.target.value)} aria-label="Booking slot date" /></label>
        </div>
      </div>
      <div className="teacher-slot-filters" role="tablist" aria-label="Slot status">
        {slotFilters.map((item) => <button type="button" role="tab" aria-selected={slotFilter === item.key} className={`teacher-slot-filter ${slotFilter === item.key ? "active" : ""}`} key={item.key} onClick={() => setSlotFilter(item.key)}>
          {item.label}<span>{slotCounts[item.key]}</span>
        </button>)}
      </div>
      <div className="teacher-slot-legend">
        <span><i className="open" />Open</span>
        <span><i className="booked" />Booked</span>
        <span><i className="pending" />Awaiting approval</span>
        <span><i className="closed" />Closed</span>
        <small>{slotCounts.booked} booked · {slotCounts.pending} pending · {slotCounts.closed} closed</small>
      </div>

      <div className="teacher-slot-list">
        {visibleSlots.map((slot) => {
          const pending = slot.status === "pending";
          const rejected = slot.status === "open" && slot.closure?.status === "rejected";
          const approvedClosure = slot.status === "closed" && slot.closure?.status === "approved";
          const past = isSlotInPast(slotDate, slot.time, now);
          const timing = slot.status === "booked" && slot.lesson
            ? formatSlotTiming(slotDate, slot.lesson.time, slot.lesson.endTime ?? slot.endTime, now)
            : formatSlotTiming(slotDate, slot.time, slot.endTime, now);
          return <article className={`teacher-slot-row status-${slot.status}${rejected ? " rejected" : ""}`} key={slot.time}>
            <div className="teacher-slot-time">
              <strong>{slot.time}</strong>
              <span>to {slot.endTime}</span>
              <small>{timing}</small>
            </div>

            <div className="teacher-slot-copy">
              {slot.status === "booked" && slot.lesson ? <>
                <div className={`avatar avatar-${slot.lesson.studentColor ?? "indigo"}`}>{slot.lesson.studentInitials ?? initials(slot.lesson.studentName ?? "Student")}</div>
                <div>
                  <strong>{slot.lesson.title}</strong>
                  <span>{slot.lesson.studentName ?? "Student"}</span>
                  <small>{slot.closure?.status === "pending" ? "A closure request was submitted after this booking." : slot.lesson.roomCode ?? "Classroom pending"}</small>
                </div>
              </> : slot.status === "pending" ? <>
                <div className="metric-icon orange"><Icon name="clock" size={16} /></div>
                <div>
                  <strong>Closure awaiting manager approval</strong>
                  <span>{slot.closure?.reason ?? "No reason provided"}</span>
                  <small>Requested {slot.closure?.requestedBy ?? "by teacher"} {slot.closure?.requestedAt ? `· ${formatTimestamp(slot.closure.requestedAt)}` : ""}</small>
                </div>
              </> : slot.status === "closed" ? <>
                <div className="metric-icon orange"><Icon name="lock" size={16} /></div>
                <div>
                  <strong>{approvedClosure ? "Closed for booking" : "Closed by default"}</strong>
                  <span>{approvedClosure ? slot.closure?.reason ?? "Approved by manager" : "This slot is not open for booking."}</span>
                  <small>{approvedClosure
                    ? `Approved ${slot.closure?.reviewedBy ? `by ${slot.closure.reviewedBy}` : "by manager"}${slot.closure?.reviewedAt ? ` · ${formatTimestamp(slot.closure.reviewedAt)}` : ""}`
                    : "Open this slot when you are ready to teach."}</small>
                </div>
              </> : rejected ? <>
                <div className="metric-icon orange"><Icon name="x" size={16} /></div>
                <div>
                  <strong>Closure request declined</strong>
                  <span>{slot.closure?.reason ?? "No reason provided"}</span>
                  <small>{slot.closure?.reviewNote ?? "Your manager did not approve this closure."}</small>
                </div>
              </> : <>
                <div className="metric-icon green"><Icon name="check" size={16} /></div>
                <div>
                  <strong>Open for booking</strong>
                  <span>Students can book this 25-minute slot.</span>
                  <small>Nothing booked yet.</small>
                </div>
              </>}
            </div>

            <div className="teacher-slot-actions">
              {slot.status === "booked" && slot.lesson && <button type="button" className="icon-text-button" onClick={() => onNavigate("Lessons")}><Icon name="file" size={14} /> View lesson</button>}
              {pending && <>
                <span className="teacher-slot-badge pending">Pending</span>
                <button type="button" className="icon-text-button" onClick={() => withdrawClosureRequest(slot)}><Icon name="x" size={14} /> Withdraw</button>
              </>}
              {!pending && !past && slot.status === "open" && !rejected && <button type="button" className="secondary-button compact-button" onClick={() => openClosureRequest(slot)}><Icon name="lock" size={14} /> Request closure</button>}
              {!past && slot.status === "closed" && <button type="button" className="secondary-button compact-button" onClick={() => openSlot(slot)}><Icon name="check" size={14} /> Open slot</button>}
              {!past && rejected && <>
                <button type="button" className="secondary-button compact-button" onClick={() => openClosureRequest(slot)}><Icon name="lock" size={14} /> Request again</button>
                <button type="button" className="icon-text-button" onClick={() => openSlot(slot)}><Icon name="x" size={14} /> Dismiss</button>
              </>}
              {past && !pending && slot.status !== "booked" && <span className="teacher-slot-badge past">Past slot</span>}
            </div>
          </article>;
        })}
        {visibleSlots.length === 0 && <div className="student-empty-inline"><Icon name="clock" /><p>No {slotFilter === "all" ? "" : slotFilter} slots on this date. Try another day or clear the filter.</p></div>}
      </div>
    </section>

    {closureTarget && <StudentModal eyebrow="REQUEST SLOT CLOSURE" title={`Close ${closureTarget.time}–${closureTarget.endTime}?`} description={`${formatLongDate(slotDate)} · Your manager must approve this request before the slot is closed.`} onClose={() => setClosureTarget(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setClosureTarget(null)}>Keep slot open</button><button type="submit" form="slot-closure-form" className="primary-button" disabled={closureReason.trim().length < 3}><Icon name="lock" size={15} /> Send for approval</button></>}>
      <form id="slot-closure-form" onSubmit={submitClosureRequest}>
        <label className="student-field">Reason for closing this slot<textarea rows={4} value={closureReason} onChange={(event) => setClosureReason(event.target.value)} placeholder="e.g. Medical appointment — I will not be able to teach at this time." autoFocus /></label>
        <div className="lesson-callout warning"><Icon name="clock" size={16} /><div><strong>Manager approval required</strong><p>The slot is held while your manager reviews the request. If it is declined, the slot reopens automatically.</p></div></div>
      </form>
    </StudentModal>}
  </div>;
}
