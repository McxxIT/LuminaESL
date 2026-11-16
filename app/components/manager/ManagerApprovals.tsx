"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { formatTimestamp, slotEnd } from "../../lib/scheduling";
import { formatLessonDate } from "../../lib/student";
import type { SchoolUser } from "../../lib/school";
import type { TeacherLesson, TeacherSlotClosure } from "../../lib/types";
import type { useApprovals } from "./useApprovals";

type Decision = "approved" | "rejected";
type ClosureTarget = { closure: TeacherSlotClosure; decision: Decision };
type CancellationTarget = { lesson: TeacherLesson; decision: Decision };

export default function ManagerApprovals({ user, approvals, onNotice }: {
  user: SchoolUser;
  approvals: ReturnType<typeof useApprovals>;
  onNotice: (message: string) => void;
}) {
  const { loaded, closures, cancellations, reviewClosure, reviewCancellation } = approvals;
  const [closureTarget, setClosureTarget] = useState<ClosureTarget | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<CancellationTarget | null>(null);
  const [note, setNote] = useState("");

  function openClosure(closure: TeacherSlotClosure, decision: Decision) {
    setNote("");
    setClosureTarget({ closure, decision });
  }

  function openCancellation(lesson: TeacherLesson, decision: Decision) {
    setNote("");
    setCancellationTarget({ lesson, decision });
  }

  function submitClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closureTarget) return;
    const result = reviewClosure(closureTarget.closure.id, closureTarget.decision, note);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    onNotice(closureTarget.decision === "approved" ? "Slot closure approved. The slot is now closed." : "Slot closure declined. The slot stays open for booking.");
    setClosureTarget(null);
  }

  function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancellationTarget) return;
    const result = reviewCancellation(cancellationTarget.lesson.id, cancellationTarget.decision, note);
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    onNotice(cancellationTarget.decision === "approved" ? "Cancellation approved. The lesson is cancelled and the student refunded." : "Cancellation declined. The lesson stays scheduled.");
    setCancellationTarget(null);
  }

  const total = closures.length + cancellations.length;

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{user.role === "admin" ? "SCHOOL APPROVALS" : "TEAM APPROVALS"}</p>
        <h1>Approvals</h1>
        <p className="subheading">Slot closures and lesson cancellations from {user.role === "admin" ? "every teacher" : "your teachers"} wait here for your decision.</p>
      </div>
      <span className="setting-count manager-heading-count">{loaded ? `${total} pending` : "Loading…"}</span>
    </section>

    <section className="panel admin-closures-panel manager-first-panel">
      <div className="panel-header"><div><h2>Slot closures</h2><p>Approving closes the slot so students can no longer book it.</p></div><span className="setting-count">{closures.length} pending</span></div>
      <div className="admin-closure-list">
        {closures.map((closure) => <article className="admin-closure-row" key={closure.id}>
          <div className="admin-closure-time"><strong>{closure.time}–{slotEnd(closure.time)}</strong><span>{formatLessonDate(closure.date)}</span></div>
          <div className="admin-closure-copy"><strong>{closure.requestedBy ?? "Teacher"} requested a slot closure</strong><span>{closure.reason}</span><small>Requested {formatTimestamp(closure.requestedAt) || "just now"}</small></div>
          <div className="admin-closure-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => openClosure(closure, "approved")}><Icon name="check" size={14} /> Approve</button>
            <button type="button" className="danger-outline-button compact-button" onClick={() => openClosure(closure, "rejected")}><Icon name="x" size={14} /> Decline</button>
          </div>
        </article>)}
        {loaded && closures.length === 0 && <div className="student-empty-inline"><Icon name="check" /><p>No slot closures waiting for review.</p></div>}
      </div>
    </section>

    <section className="panel admin-closures-panel">
      <div className="panel-header"><div><h2>Lesson cancellations</h2><p>Approving cancels the lesson. Late requests cost the teacher performance points.</p></div><span className="setting-count">{cancellations.length} pending</span></div>
      <div className="admin-closure-list">
        {cancellations.map((lesson) => <article className="admin-closure-row" key={lesson.id}>
          <div className="admin-closure-time"><strong>{lesson.time}–{lesson.endTime}</strong><span>{formatLessonDate(lesson.date)}</span></div>
          <div className="admin-closure-copy">
            <strong>{lesson.teacherName} · {lesson.studentName} · {lesson.title}</strong>
            <span>{lesson.cancellation?.reason} · {lesson.cancellation?.comment}</span>
            <small>Requested {formatTimestamp(lesson.cancellation?.requestedAt) || "just now"}{lesson.cancellation?.requestedBy ? ` by ${lesson.cancellation.requestedBy}` : ""}</small>
          </div>
          <div className="admin-closure-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => openCancellation(lesson, "approved")}><Icon name="check" size={14} /> Approve</button>
            <button type="button" className="danger-outline-button compact-button" onClick={() => openCancellation(lesson, "rejected")}><Icon name="x" size={14} /> Decline</button>
          </div>
        </article>)}
        {loaded && cancellations.length === 0 && <div className="student-empty-inline"><Icon name="check" /><p>No lesson cancellations waiting for review.</p></div>}
      </div>
    </section>

    {closureTarget && <Modal eyebrow="CLOSURE REVIEW" title={`${closureTarget.decision === "approved" ? "Approve" : "Decline"} closure for ${closureTarget.closure.time}?`} description={`${formatLessonDate(closureTarget.closure.date)} · ${closureTarget.closure.reason}`} onClose={() => setClosureTarget(null)}
      footer={<><button type="button" className="cancel-button" onClick={() => setClosureTarget(null)}>Keep pending</button><button type="submit" form="manager-closure-form" className={closureTarget.decision === "approved" ? "primary-button" : "danger-button"}>{closureTarget.decision === "approved" ? "Approve closure" : "Decline closure"}</button></>}>
      <form id="manager-closure-form" onSubmit={submitClosure}>
        <label className="student-field">Note to teacher (optional)<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={closureTarget.decision === "approved" ? "e.g. Approved, take care." : "e.g. We need this slot covered this week."} /></label>
        <div className={`lesson-callout ${closureTarget.decision === "approved" ? "" : "warning"}`}><Icon name={closureTarget.decision === "approved" ? "check" : "x"} size={16} /><div><strong>{closureTarget.decision === "approved" ? "The slot closes immediately" : "The slot stays open"}</strong><p>{closureTarget.decision === "approved" ? "Students will no longer see this time when booking." : "The teacher keeps the slot and sees your note."}</p></div></div>
      </form>
    </Modal>}

    {cancellationTarget && <Modal eyebrow="CANCELLATION REVIEW" title={`${cancellationTarget.decision === "approved" ? "Approve" : "Decline"} cancellation of ${cancellationTarget.lesson.title}?`} description={`${cancellationTarget.lesson.studentName} · ${formatLessonDate(cancellationTarget.lesson.date)} · ${cancellationTarget.lesson.time}–${cancellationTarget.lesson.endTime}`} onClose={() => setCancellationTarget(null)} size="wide"
      footer={<><button type="button" className="cancel-button" onClick={() => setCancellationTarget(null)}>Keep pending</button><button type="submit" form="manager-cancellation-form" className={cancellationTarget.decision === "approved" ? "primary-button" : "danger-button"}>{cancellationTarget.decision === "approved" ? "Approve cancellation" : "Decline cancellation"}</button></>}>
      <form id="manager-cancellation-form" onSubmit={submitCancellation}>
        <div className="lesson-detail-section manager-review-reason"><span className="eyebrow">REASON</span><p><strong>{cancellationTarget.lesson.cancellation?.reason}</strong> · requested by {cancellationTarget.lesson.cancellation?.requestedBy ?? "Teacher"}</p></div>
        <div className="lesson-detail-section"><span className="eyebrow">TEACHER COMMENT</span><p>{cancellationTarget.lesson.cancellation?.comment}</p></div>
        {cancellationTarget.lesson.cancellation?.attachment && <div className="lesson-detail-section">
          <span className="eyebrow">ATTACHMENT</span>
          <a href={cancellationTarget.lesson.cancellation.attachment.dataUrl} target="_blank" rel="noreferrer" download={cancellationTarget.lesson.cancellation.attachment.name}>
            {cancellationTarget.lesson.cancellation.attachment.type.startsWith("image/")
              ? <Image src={cancellationTarget.lesson.cancellation.attachment.dataUrl} alt={cancellationTarget.lesson.cancellation.attachment.name} width={240} height={160} unoptimized style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }} />
              : <><Icon name="file" size={14} /> {cancellationTarget.lesson.cancellation.attachment.name}</>}
          </a>
        </div>}
        <label className="student-field">Note to teacher (optional)<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={cancellationTarget.decision === "approved" ? "e.g. Approved. We will rebook the student." : "e.g. Please keep this lesson; we cannot cover it."} /></label>
        <div className={`lesson-callout ${cancellationTarget.decision === "approved" ? "" : "warning"}`}><Icon name={cancellationTarget.decision === "approved" ? "check" : "x"} size={16} /><div><strong>{cancellationTarget.decision === "approved" ? "The lesson will be cancelled" : "The lesson stays scheduled"}</strong><p>{cancellationTarget.decision === "approved" ? "The teacher and student both see it as cancelled." : "The teacher sees your note and keeps the lesson."}</p></div></div>
      </form>
    </Modal>}
  </div>;
}
