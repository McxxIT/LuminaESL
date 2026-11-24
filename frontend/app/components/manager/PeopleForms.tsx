"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { teacherLevelOptions } from "../../lib/data";
import type { Course, Guardian, SchoolUser } from "../../lib/school";
import type { ServiceResult } from "../../lib/school/services";

/**
 * Create/edit forms for people management. Each form calls `onSubmit`, shows a service error
 * inline, and closes itself only when the service succeeds.
 */

type Submit<T> = (values: T) => ServiceResult<unknown> | Promise<ServiceResult<unknown>>;

function FormModal({ id, eyebrow, title, description, submitLabel, danger, onClose, onSubmit, children }: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  submitLabel: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: () => ServiceResult<unknown> | Promise<ServiceResult<unknown>>;
  children: ReactNode;
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onSubmit();
    if (result.ok) onClose();
    else setError(result.error);
  }
  return <Modal eyebrow={eyebrow} title={title} description={description} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form={id} className={danger ? "danger-button" : "primary-button"}>{submitLabel}</button></>}>
    <form id={id} className="student-form-grid" onSubmit={submit} noValidate>
      {children}
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}

function LevelSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{teacherLevelOptions.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>;
}

// Managers --------------------------------------------------------------------------------

export function ManagerFormModal({ initial, onSubmit, onClose }: {
  initial?: { name: string; email: string };
  onSubmit: Submit<{ name: string; email: string }>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial ?? { name: "", email: "" });
  return <FormModal id="manager-form" eyebrow={initial ? "EDIT MANAGER" : "NEW MANAGER"} title={initial ? `Edit ${initial.name}` : "Add a manager"}
    description={initial ? undefined : "They can sign in right away with this email and look after the teachers you assign them."}
    submitLabel={initial ? "Save changes" : "Add manager"} onClose={onClose} onSubmit={() => onSubmit(form)}>
    <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Dana Cruz" autoFocus /></label>
    <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@lumina.school" /></label>
  </FormModal>;
}

// Teachers --------------------------------------------------------------------------------

export type TeacherFormValues = { name: string; email: string; headline: string; specializations: string; bio: string; managerId: string };

export function TeacherFormModal({ initial, managers, onSubmit, onClose }: {
  initial?: TeacherFormValues;
  /** Pass to let the admin choose the manager (create only). */
  managers?: SchoolUser[];
  onSubmit: Submit<TeacherFormValues>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TeacherFormValues>(initial ?? { name: "", email: "", headline: "", specializations: "", bio: "", managerId: managers?.[0]?.id ?? "" });
  return <FormModal id="teacher-form" eyebrow={initial ? "EDIT TEACHER" : "NEW TEACHER"} title={initial ? `Edit ${initial.name}` : "Add a teacher"}
    description={initial ? undefined : "The teacher can sign in right away with this email and start opening booking slots."}
    submitLabel={initial ? "Save changes" : "Add teacher"} onClose={onClose} onSubmit={() => onSubmit(form)}>
    <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ana Lopez" autoFocus /></label>
    <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@lumina.school" /></label>
    <label className="full-field">Headline<input value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} placeholder="e.g. Business English and interview coach" /></label>
    <label className="full-field">Specialties<input value={form.specializations} onChange={(event) => setForm({ ...form, specializations: event.target.value })} placeholder="Comma separated, e.g. IELTS, Pronunciation" /></label>
    {managers && <label className="full-field">Manager<select value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}>
      {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
      <option value="">No manager yet</option>
    </select></label>}
    <label className="full-field">Bio<textarea rows={3} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="Optional. Shown on the teacher's profile." /></label>
  </FormModal>;
}

// Students --------------------------------------------------------------------------------

export type StudentFormValues = {
  name: string;
  email: string;
  level: string;
  targetLevel: string;
  goal: string;
  guardianName: string;
  guardianEmail: string;
  teacherId: string;
  courseId: string;
  startingCredits: string;
};

export function toGuardian(values: StudentFormValues): Guardian | null {
  return values.guardianName.trim() ? { name: values.guardianName, email: values.guardianEmail, relationship: "Parent" } : null;
}

export function StudentFormModal({ initial, teachers, courses, onSubmit, onClose }: {
  initial?: StudentFormValues;
  /** Create mode: teachers and courses to enroll the new student with. */
  teachers?: SchoolUser[];
  courses?: Course[];
  onSubmit: Submit<StudentFormValues>;
  onClose: () => void;
}) {
  const creating = !initial;
  const [form, setForm] = useState<StudentFormValues>(initial ?? {
    name: "", email: "", level: "B1 Intermediate", targetLevel: "B2 Upper intermediate", goal: "", guardianName: "", guardianEmail: "",
    teacherId: teachers?.find((teacher) => teacher.status === "active")?.id ?? "", courseId: courses?.[0]?.id ?? "", startingCredits: "5",
  });
  return <FormModal id="student-form" eyebrow={creating ? "NEW STUDENT" : "EDIT STUDENT"} title={creating ? "Add a student" : `Edit ${initial.name}`}
    description={creating ? "The student can sign in right away and book with the teacher you choose." : undefined}
    submitLabel={creating ? "Add student" : "Save changes"} onClose={onClose} onSubmit={() => onSubmit(form)}>
    <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Sam Rivera" autoFocus /></label>
    <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>
    <LevelSelect label="Current level" value={form.level} onChange={(level) => setForm({ ...form, level })} />
    <LevelSelect label="Target level" value={form.targetLevel} onChange={(targetLevel) => setForm({ ...form, targetLevel })} />
    <label className="full-field">Learning goal<input value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="e.g. Speak confidently in client meetings" /></label>
    {creating && teachers && courses && <>
      <label>Teacher<select value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}>
        {teachers.filter((teacher) => teacher.status === "active").map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        <option value="">Enroll later</option>
      </select></label>
      <label>Course<select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })} disabled={!form.teacherId}>
        {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
      </select></label>
      <label className="full-field">Starting credits<input type="number" min="0" step="0.5" value={form.startingCredits} onChange={(event) => setForm({ ...form, startingCredits: event.target.value })} /><small>One 25-minute lesson uses 1 credit.</small></label>
    </>}
    <label>Guardian name<input value={form.guardianName} onChange={(event) => setForm({ ...form, guardianName: event.target.value })} placeholder="Optional" /></label>
    <label>Guardian email<input type="email" value={form.guardianEmail} onChange={(event) => setForm({ ...form, guardianEmail: event.target.value })} placeholder="Optional" /></label>
  </FormModal>;
}

export function EnrollmentModal({ studentName, teachers, courses, initialTeacherId, initialCourseId, onSubmit, onClose }: {
  studentName: string;
  teachers: SchoolUser[];
  courses: Course[];
  initialTeacherId?: string | null;
  initialCourseId?: string;
  onSubmit: Submit<{ teacherId: string; courseId: string }>;
  onClose: () => void;
}) {
  const active = teachers.filter((teacher) => teacher.status === "active");
  const [form, setForm] = useState({ teacherId: initialTeacherId ?? active[0]?.id ?? "", courseId: initialCourseId ?? courses[0]?.id ?? "" });
  return <FormModal id="enrollment-form" eyebrow="ENROLLMENT" title={`Teacher and course for ${studentName}`}
    description="The current enrollment ends and a new one starts. Lessons already booked stay with the teacher they were booked with."
    submitLabel="Save enrollment" onClose={onClose} onSubmit={() => onSubmit(form)}>
    <label>Teacher<select value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}>{active.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
    <label>Course<select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
  </FormModal>;
}

export function CreditAdjustModal({ studentName, balance, onSubmit, onClose }: {
  studentName: string;
  balance: number;
  onSubmit: Submit<{ hours: number; reason: string }>;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [hours, setHours] = useState("1");
  const [reason, setReason] = useState("");
  const amount = Number(hours) || 0;
  const next = Number((balance + (direction === "add" ? amount : -amount)).toFixed(2));
  return <FormModal id="credit-form" eyebrow="CREDITS" title={`Adjust credits for ${studentName}`} description={`Current balance: ${balance.toFixed(2)} credits.`}
    submitLabel="Save adjustment" onClose={onClose} onSubmit={() => onSubmit({ hours: direction === "add" ? amount : -amount, reason })}>
    <label>Change<select value={direction} onChange={(event) => setDirection(event.target.value as "add" | "remove")}><option value="add">Add credits</option><option value="remove">Remove credits</option></select></label>
    <label>Credits<input type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
    <label className="full-field">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Goodwill credit for a technical issue" /></label>
    <p className="student-form-note full-field">New balance: <strong>{next.toFixed(2)} credits</strong>{next < 0 ? " (cannot go below zero)" : ""}</p>
  </FormModal>;
}

// Status and absences ---------------------------------------------------------------------

export function ConfirmStatusModal({ person, onConfirm, onClose }: { person: SchoolUser; onConfirm: () => ServiceResult<unknown> | Promise<ServiceResult<unknown>>; onClose: () => void }) {
  const pausing = person.status === "active";
  return <FormModal id="status-form" eyebrow={pausing ? "PAUSE ACCOUNT" : "REACTIVATE ACCOUNT"} title={`${pausing ? "Pause" : "Reactivate"} ${person.name}?`}
    submitLabel={pausing ? "Pause account" : "Reactivate"} danger={pausing} onClose={onClose} onSubmit={onConfirm}>
    <div className={`lesson-callout full-field ${pausing ? "warning" : ""}`}><Icon name={pausing ? "lock" : "check"} size={16} /><div>
      <strong>{pausing ? "They will not be able to sign in or act" : "They can sign in again right away"}</strong>
      <p>{pausing
        ? person.role === "teacher" ? "Students cannot book new lessons with a paused teacher. Lessons already booked stay on the schedule." : person.role === "student" ? "The student cannot book or manage lessons while paused." : "Their teachers stay assigned to them; the admin still sees every approval."
        : "Everything they had before pausing is still there."}</p>
    </div></div>
  </FormModal>;
}

export function ResetPasswordModal({ person, onSubmit, onClose }: { person: SchoolUser; onSubmit: Submit<string>; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return <FormModal id="reset-password-form" eyebrow="RESET PASSWORD" title={`Set a new password for ${person.name}`}
    description={person.email} submitLabel="Reset password" danger onClose={onClose}
    onSubmit={() => {
      if (password.length < 10 || password.length > 128) return { ok: false, error: "The new password must be 10 to 128 characters." };
      if (password !== confirm) return { ok: false, error: "The passwords do not match." };
      return onSubmit(password);
    }}>
    <label>New password<input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} autoFocus /><small>At least 10 characters. Share it with them privately.</small></label>
    <label>Confirm new password<input type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={128} /></label>
    <div className="lesson-callout warning full-field"><Icon name="lock" size={16} /><div>
      <strong>Their old password stops working right away</strong>
      <p>Devices where they are already signed in lose access within 15 minutes, when their current session expires. They then sign in with the new password.</p>
    </div></div>
  </FormModal>;
}

export function AbsenceModal({ lessonLabel, onSubmit, onClose }: { lessonLabel: string; onSubmit: Submit<string>; onClose: () => void }) {
  const [note, setNote] = useState("");
  return <FormModal id="absence-form" eyebrow="RECORD ABSENCE" title="Teacher missed this lesson?" description={lessonLabel}
    submitLabel="Record absence" danger onClose={onClose} onSubmit={() => onSubmit(note)}>
    <label className="full-field">What happened<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Teacher did not join; the student waited 15 minutes." autoFocus /></label>
    <div className="lesson-callout warning full-field"><Icon name="clock" size={16} /><div><strong>-20 performance points</strong><p>The lesson is cancelled and the student gets their credit back.</p></div></div>
  </FormModal>;
}
