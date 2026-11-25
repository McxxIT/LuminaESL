"use client";

import { useCallback, useMemo, useState } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { ConfirmStatusModal, CreditAdjustModal, EMAIL_ADMIN_ONLY_NOTE, EMAIL_INVITED_NOTE, EnrollmentModal, ResetPasswordModal, StudentFormModal, toGuardian, type StudentFormValues } from "./PeopleForms";
import { isDemoMode } from "../../lib/auth/mode";
import { PlanPickerModal } from "./CurriculumForms";
import { LibraryPickerModal } from "./LibraryForms";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  activeCourseProgress,
  attachablePlans,
  can,
  courseById,
  lessonPlanForLesson,
  libraryForLesson,
  creditBalance,
  enrollmentsForStudent,
  lessonsForStudent,
  nameOf,
  plansForCourse,
  publishedCourses,
  studentProfile,
  studentsForUser,
  teachersForUser,
  type Lesson,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { adjustCredits, assignPlanToLesson, createStudent, enrollStudent, resetPersonPassword, setPersonStatus, updateStudent } from "../../lib/school/services";
import { formatLessonDate, todayISO } from "../../lib/student";
import { LessonStatusBadge, PersonAvatar, UserStatusBadge } from "./parts";
import { InviteResultModal, ResendInviteButton, canResendInvite, type InviteResult } from "./InviteForms";
import type { InviteOutcome } from "../../lib/api/types";

function selectStudents(data: SchoolData, user: SchoolUser) {
  const today = todayISO();
  return studentsForUser(data, user).map((student) => {
    const enrollment = enrollmentsForStudent(data, student.id).find((item) => item.status === "active");
    const lessons = lessonsForStudent(data, student.id);
    const completed = lessons.filter((lesson) => lesson.status === "completed");
    const attended = completed.filter((lesson) => lesson.attendance === "attended").length;
    const upcoming = lessons.filter((lesson) => (lesson.status === "scheduled" || lesson.status === "live") && lesson.date >= today);
    return {
      student,
      profile: studentProfile(data, student.id),
      teacherId: enrollment?.teacherId ?? null,
      courseId: enrollment?.courseId,
      teacherName: nameOf(data, enrollment?.teacherId, "No teacher"),
      courseTitle: courseById(data, enrollment?.courseId)?.title ?? "Not enrolled",
      credits: creditBalance(data, student.id),
      progress: activeCourseProgress(data, student.id),
      completedCount: completed.length,
      attendance: completed.length ? Math.round((attended / completed.length) * 100) : null,
      upcoming: upcoming.slice(0, 4).map((lesson) => ({
        lesson,
        teacher: nameOf(data, lesson.teacherId),
        planTitle: lessonPlanForLesson(data, lesson)?.title,
        materials: libraryForLesson(data, lesson.id).length,
        canAttachLibrary: can(data, user, "lesson.attachLibraryItem", { lessonId: lesson.id }),
      })),
      recent: completed.slice(-3).reverse().map((lesson) => ({ lesson, teacher: nameOf(data, lesson.teacherId) })),
      canManage: can(data, user, "student.manage", { studentId: student.id }),
    };
  });
}

type StudentRow = ReturnType<typeof selectStudents>[number];
type Dialog = { kind: "create" } | { kind: "edit" | "enroll" | "credits" | "status" | "reset-password"; row: StudentRow } | { kind: "plan" | "library"; row: StudentRow; lesson: Lesson; teacher: string } | null;

function formValues(row: StudentRow): StudentFormValues {
  return {
    name: row.student.name,
    email: row.student.email,
    level: row.profile?.level ?? "B1 Intermediate",
    targetLevel: row.profile?.targetLevel ?? "B2 Upper intermediate",
    goal: row.profile?.goal ?? "",
    guardianName: row.profile?.guardian?.name ?? "",
    guardianEmail: row.profile?.guardian?.email ?? "",
    teacherId: row.teacherId ?? "",
    courseId: row.courseId ?? "",
    startingCredits: "0",
  };
}

export default function ManagerStudents({ user, onNotice }: { user: SchoolUser; onNotice: (message: string) => void }) {
  const select = useCallback((data: SchoolData) => selectStudents(data, user), [user]);
  const rows = useSchool(select);
  const selectTeachers = useCallback((data: SchoolData) => teachersForUser(data, user), [user]);
  const teachers = useSchool(selectTeachers);
  const selectPlanGroups = useCallback((data: SchoolData) => attachablePlans(data, user), [user]);
  const planGroups = useSchool(selectPlanGroups);
  // Courses with the most ready lesson plans first, so the default choice is a complete course.
  const selectCourses = useCallback((data: SchoolData) => [...publishedCourses(data)].sort((a, b) => plansForCourse(data, b.id).length - plansForCourse(data, a.id).length), []);
  const courses = useSchool(selectCourses);
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => (teacherFilter === "all" || (teacherFilter === "none" ? !row.teacherId : row.teacherId === teacherFilter))
      && (!search || `${row.student.name} ${row.student.email} ${row.profile?.goal ?? ""}`.toLowerCase().includes(search)));
  }, [rows, query, teacherFilter]);
  const selected: StudentRow | undefined = rows.find((row) => row.student.id === selectedId);

  function showResend(person: SchoolUser, result: { ok: true; value: InviteOutcome } | { ok: false; error: string }) {
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setSelectedId(null);
    setInviteResult({ person, invite: result.value });
  }

  async function submitCreate(values: StudentFormValues) {
    const result = await createStudent(user.id, {
      ...values,
      guardian: toGuardian(values),
      teacherId: values.teacherId || undefined,
      courseId: values.teacherId ? values.courseId : undefined,
      startingCredits: Number(values.startingCredits) || 0,
    });
    if (result.ok) {
      // API mode: the person is invited by email; demo keeps its sign-in notice.
      if (result.value.invite) setInviteResult({ person: result.value, invite: result.value.invite });
      else onNotice(`${result.value.name} was added. They can sign in with ${result.value.email}.`);
    }
    return result;
  }

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{user.role === "admin" ? "ALL STUDENTS" : "YOUR STUDENTS"}</p>
        <h1>Students</h1>
        <p className="subheading">Who each student learns with, which course they follow, and their credits.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="primary-button" onClick={() => setDialog({ kind: "create" })} disabled={teachers.length === 0} title={teachers.length === 0 ? "Add a teacher first" : undefined}><Icon name="plus" size={15} /> Add student</button>
      </div>
    </section>

    <section className="panel student-panel">
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students or goals…" aria-label="Search students" /></label>
        <label className="student-select"><Icon name="filter" size={15} /><select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} aria-label="Filter by teacher"><option value="all">All teachers</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}<option value="none">Not enrolled</option></select></label>
        <span className="student-filter-count">Showing {filtered.length} of {rows.length} students</span>
      </div>
      <div className="manager-table" role="table" aria-label="Students">
        <div className="manager-table-head students" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Teacher</span>
          <span role="columnheader">Course</span>
          <span role="columnheader">Credits</span>
          <span role="columnheader">Status</span>
        </div>
        {filtered.map((row) => <button type="button" role="row" className="manager-table-row students" key={row.student.id} onClick={() => setSelectedId(row.student.id)}>
          <span className="manager-person" role="cell"><PersonAvatar name={row.student.name} color={row.student.avatarColor} /><span><strong>{row.student.name}</strong><small>{row.profile ? `${row.profile.level} → ${row.profile.targetLevel}` : row.student.email}</small></span></span>
          <span role="cell" className="manager-cell" data-label="Teacher">{row.teacherName}</span>
          <span role="cell" className="manager-cell" data-label="Course">{row.courseTitle}{row.progress && row.progress.total > 0 && <small className="manager-progress-inline">{row.progress.completed}/{row.progress.total} lessons</small>}</span>
          <span role="cell" className={`manager-cell ${row.credits < 2 ? "manager-low" : ""}`} data-label="Credits">{row.credits.toFixed(1)} credits</span>
          <span role="cell" className="manager-cell" data-label="Status"><UserStatusBadge status={row.student.status} /></span>
        </button>)}
        {filtered.length === 0 && <div className="student-empty-inline"><Icon name="user" /><p>{rows.length ? "No students match your search." : "No students yet. Add your first student."}</p></div>}
      </div>
    </section>

    {inviteResult && <InviteResultModal actorId={user.id} person={inviteResult.person} invite={inviteResult.invite}
      canResend={canResendInvite(user, { ...inviteResult.person, status: "invited", avatarColor: "", createdAt: "" })} onClose={() => setInviteResult(null)} />}
    {selected && !dialog && <Modal eyebrow="STUDENT" title={selected.student.name} description={`${selected.student.email}${selected.profile?.goal ? ` · ${selected.profile.goal}` : ""}`} onClose={() => setSelectedId(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedId(null)}>Close</button>
        {selected.canManage && <>
          {selected.student.status === "invited" ? <>
            {canResendInvite(user, selected.student) && <ResendInviteButton actorId={user.id} person={selected.student} onResult={showResend} />}
          </> : <>
            {user.role === "admin" && !isDemoMode() && <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "reset-password", row: selected })}><Icon name="lock" size={14} /> Reset password</button>}
            <button type="button" className={selected.student.status === "active" ? "danger-outline-button" : "secondary-button"} onClick={() => setDialog({ kind: "status", row: selected })}>{selected.student.status === "active" ? "Pause" : "Reactivate"}</button>
          </>}
          <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "credits", row: selected })}><Icon name="wallet" size={14} /> Credits</button>
          <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "enroll", row: selected })}><Icon name="users" size={14} /> Teacher &amp; course</button>
          <button type="button" className="primary-button" onClick={() => setDialog({ kind: "edit", row: selected })}><Icon name="edit" size={14} /> Edit</button>
        </>}
      </>}>
      <div className="manager-detail-stats">
        <div><span className="eyebrow">LEVEL</span><strong>{selected.profile?.level ?? "—"}</strong></div>
        <div><span className="eyebrow">TEACHER</span><strong>{selected.teacherName}</strong></div>
        <div><span className="eyebrow">CREDITS</span><strong className={selected.credits < 2 ? "manager-low" : ""}>{selected.credits.toFixed(2)} credits</strong></div>
        <div><span className="eyebrow">ATTENDANCE</span><strong>{selected.attendance === null ? "—" : `${selected.attendance}%`}</strong></div>
      </div>
      <div className="lesson-detail-section">
        <span className="eyebrow">COURSE PROGRESS</span>
        {selected.progress ? <div className="manager-course-progress">
          <div><strong>{selected.progress.courseTitle}</strong><span>{selected.progress.completed} of {selected.progress.total} lessons</span></div>
          <div className="bar"><i style={{ width: `${selected.progress.total ? Math.round((selected.progress.completed / selected.progress.total) * 100) : 0}%` }} /></div>
          <small>{selected.progress.nextPlan ? `Next: ${selected.progress.nextPlan.title}` : "Course complete"}</small>
        </div> : <p>Not enrolled in a course yet. Use <strong>Teacher &amp; course</strong> to enroll them.</p>}
      </div>
      {selected.profile?.guardian && <div className="lesson-detail-section"><span className="eyebrow">GUARDIAN</span><p><strong>{selected.profile.guardian.name}</strong>{selected.profile.guardian.relationship ? ` (${selected.profile.guardian.relationship})` : ""}{selected.profile.guardian.email ? ` · ${selected.profile.guardian.email}` : ""}</p></div>}
      <div className="lesson-detail-section">
        <span className="eyebrow">UPCOMING</span>
        <div className="manager-mini-list">
          {selected.upcoming.map(({ lesson, teacher, planTitle, materials, canAttachLibrary }) => <div key={lesson.id}><span>{formatLessonDate(lesson.date)} · {lesson.time}</span><strong>{lesson.title}<small className="manager-plan-line">{planTitle ? `Plan: ${planTitle}` : "No plan yet"}{materials > 0 ? ` · ${materials} material${materials === 1 ? "" : "s"}` : ""}</small></strong><small>{teacher}</small>
            {canAttachLibrary && <button type="button" className="secondary-button compact-button" onClick={() => setDialog({ kind: "library", row: selected, lesson, teacher })}>Materials</button>}
            {selected.canManage ? <button type="button" className="secondary-button compact-button" onClick={() => setDialog({ kind: "plan", row: selected, lesson, teacher })}>Change plan</button> : <LessonStatusBadge status={lesson.status} />}
          </div>)}
          {selected.upcoming.length === 0 && <p>No upcoming lessons.</p>}
        </div>
      </div>
      <div className="lesson-detail-section">
        <span className="eyebrow">RECENT LESSONS</span>
        <div className="manager-mini-list">
          {selected.recent.map(({ lesson, teacher }) => <div key={lesson.id}><span>{formatLessonDate(lesson.date)} · {lesson.time}</span><strong>{lesson.title}</strong><small>{teacher}{lesson.attendance === "no-show" ? " · no-show" : ""}</small><LessonStatusBadge status={lesson.status} /></div>)}
          {selected.recent.length === 0 && <p>No completed lessons yet.</p>}
        </div>
      </div>
    </Modal>}

    {dialog?.kind === "create" && <StudentFormModal teachers={teachers} courses={courses} onSubmit={submitCreate} onClose={() => setDialog(null)} />}
    {dialog?.kind === "edit" && <StudentFormModal initial={formValues(dialog.row)}
      lockEmail={user.role !== "admin"}
      emailNote={user.role !== "admin" ? EMAIL_ADMIN_ONLY_NOTE : dialog.row.student.status === "invited" ? EMAIL_INVITED_NOTE : undefined}
      onClose={() => setDialog(null)} onSubmit={async (values) => {
      const result = await updateStudent(user.id, dialog.row.student.id, { ...values, guardian: toGuardian(values) });
      if (result.ok) {
        onNotice(result.value.warning ?? `${values.name} was updated.`);
        if (result.value.invite) {
          setInviteResult({ person: { ...dialog.row.student, email: values.email.trim().toLowerCase() }, invite: result.value.invite });
        }
      }
      return result;
    }} />}
    {dialog?.kind === "enroll" && <EnrollmentModal studentName={dialog.row.student.name} teachers={teachers} courses={courses} initialTeacherId={dialog.row.teacherId} initialCourseId={dialog.row.courseId} onClose={() => setDialog(null)} onSubmit={async ({ teacherId, courseId }) => {
      const result = await enrollStudent(user.id, dialog.row.student.id, teacherId, courseId);
      if (result.ok) onNotice(`${dialog.row.student.name} now learns with ${teachers.find((teacher) => teacher.id === teacherId)?.name}.`);
      return result;
    }} />}
    {dialog?.kind === "credits" && <CreditAdjustModal studentName={dialog.row.student.name} balance={dialog.row.credits} onClose={() => setDialog(null)} onSubmit={async ({ hours, reason }) => {
      const result = await adjustCredits(user.id, dialog.row.student.id, hours, reason);
      if (result.ok) onNotice(`Credits ${hours > 0 ? "added" : "removed"} for ${dialog.row.student.name}.`);
      return result;
    }} />}
    {dialog?.kind === "plan" && <PlanPickerModal
      lessonLabel={`${dialog.lesson.title} with ${dialog.teacher} · ${formatLessonDate(dialog.lesson.date)} ${dialog.lesson.time}`}
      groups={planGroups}
      currentPlanId={dialog.lesson.lessonPlanId}
      preferredCourseId={dialog.row.progress?.courseId}
      onClose={() => setDialog(null)}
      onSubmit={async (planId) => {
        const result = await assignPlanToLesson(user.id, dialog.lesson.id, planId);
        if (result.ok) onNotice(planId ? "Plan updated. The teacher and student see it now." : "Plan removed from the lesson.");
        return result;
      }} />}
    {dialog?.kind === "library" && <LibraryPickerModal user={user} lessonId={dialog.lesson.id}
      lessonLabel={`${dialog.lesson.title} with ${dialog.teacher} · ${formatLessonDate(dialog.lesson.date)} ${dialog.lesson.time}`}
      lessonOpen={dialog.lesson.status === "scheduled" || dialog.lesson.status === "live"}
      onNotice={onNotice} onClose={() => setDialog(null)} />}
    {dialog?.kind === "reset-password" && <ResetPasswordModal person={dialog.row.student} onClose={() => setDialog(null)} onSubmit={async (password) => {
      const result = await resetPersonPassword(user.id, dialog.row.student.id, password);
      if (result.ok) onNotice(`${dialog.row.student.name}’s password was reset.`);
      return result;
    }} />}
    {dialog?.kind === "status" && <ConfirmStatusModal person={dialog.row.student} onClose={() => setDialog(null)} onConfirm={async () => {
      const pausing = dialog.row.student.status === "active";
      const result = await setPersonStatus(user.id, dialog.row.student.id, pausing ? "paused" : "active");
      if (result.ok) onNotice(`${dialog.row.student.name} was ${pausing ? "paused" : "reactivated"}.`);
      return result;
    }} />}
  </div>;
}
