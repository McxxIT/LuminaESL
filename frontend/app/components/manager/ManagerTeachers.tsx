"use client";

import { useCallback, useMemo, useState } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { AbsenceModal, ConfirmStatusModal, ResetPasswordModal, TeacherFormModal, type TeacherFormValues } from "./PeopleForms";
import { isDemoMode } from "../../lib/auth/mode";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  absencesForTeacher,
  can,
  lessonsForTeacher,
  managerIdForTeacher,
  nameOf,
  performanceForTeacher,
  studentsForUser,
  teacherProfile,
  teachersForUser,
  usersByRole,
  type Lesson,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { assignTeacherToManager, createTeacher, recordTeacherAbsence, resetPersonPassword, setPersonStatus, updateTeacher } from "../../lib/school/services";
import { slotStartDate } from "../../lib/scheduling";
import { formatLessonDate, isoDaysFromNow, todayISO } from "../../lib/student";
import { LessonStatusBadge, PersonAvatar, ScorePill, UserStatusBadge } from "./parts";
import { InviteResultModal, ResendInviteButton, canResendInvite, type InviteResult } from "./InviteForms";
import type { InviteOutcome } from "../../lib/api/types";

function selectTeachers(data: SchoolData, user: SchoolUser) {
  const today = todayISO();
  const weekEnd = isoDaysFromNow(7);
  const now = Date.now();
  return teachersForUser(data, user).map((teacher) => {
    const lessons = lessonsForTeacher(data, teacher.id);
    const upcoming = lessons.filter((lesson) => (lesson.status === "scheduled" || lesson.status === "live") && lesson.date >= today);
    const absentLessonIds = new Set(absencesForTeacher(data, teacher.id).map((absence) => absence.lessonId));
    // Lessons that have started (last 14 days) and could still be marked as a teacher absence.
    const recent = lessons
      .filter((lesson) => lesson.status !== "cancelled" && lesson.date >= isoDaysFromNow(-14) && slotStartDate(lesson.date, lesson.time).getTime() <= now && !absentLessonIds.has(lesson.id))
      .slice(-5).reverse();
    const managerId = managerIdForTeacher(data, teacher.id);
    return {
      teacher,
      profile: teacherProfile(data, teacher.id),
      managerId,
      managerName: nameOf(data, managerId, "Unassigned"),
      performance: performanceForTeacher(data, teacher.id),
      students: studentsForUser(data, teacher),
      lessonsThisWeek: upcoming.filter((lesson) => lesson.date <= weekEnd).length,
      upcoming: upcoming.slice(0, 5).map((lesson) => ({ lesson, student: nameOf(data, lesson.studentId) })),
      recent: recent.map((lesson) => ({ lesson, student: nameOf(data, lesson.studentId) })),
      canManage: can(data, user, "teacher.manage", { teacherId: teacher.id }),
    };
  });
}

type TeacherRow = ReturnType<typeof selectTeachers>[number];
type Dialog = { kind: "create" } | { kind: "edit"; row: TeacherRow } | { kind: "status" | "reset-password"; row: TeacherRow } | { kind: "absence"; lesson: Lesson; label: string } | null;

export default function ManagerTeachers({ user, onNotice }: { user: SchoolUser; onNotice: (message: string) => void }) {
  const select = useCallback((data: SchoolData) => selectTeachers(data, user), [user]);
  const rows = useSchool(select);
  const selectManagers = useCallback((data: SchoolData) => usersByRole(data, "manager").filter((manager) => manager.status === "active"), []);
  const managers = useSchool(selectManagers);
  const isAdmin = user.role === "admin";
  const [query, setQuery] = useState("");
  const [managerFilter, setManagerFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => (managerFilter === "all" || (managerFilter === "none" ? !row.managerId : row.managerId === managerFilter))
      && (!search || `${row.teacher.name} ${row.teacher.email} ${row.profile?.specializations.join(" ") ?? ""}`.toLowerCase().includes(search)));
  }, [rows, query, managerFilter]);
  const selected: TeacherRow | undefined = rows.find((row) => row.teacher.id === selectedId);

  async function submitCreate(values: TeacherFormValues) {
    const result = await createTeacher(user.id, { ...values, managerId: values.managerId || null });
    if (result.ok) {
      // API mode: the person is invited by email; demo keeps its sign-in notice.
      if (result.value.invite) setInviteResult({ person: result.value, invite: result.value.invite });
      else onNotice(`${result.value.name} was added. They can sign in with ${result.value.email}.`);
    }
    return result;
  }

  function showResend(person: SchoolUser, result: { ok: true; value: InviteOutcome } | { ok: false; error: string }) {
    if (!result.ok) {
      onNotice(result.error);
      return;
    }
    setSelectedId(null);
    setInviteResult({ person, invite: result.value });
  }

  async function submitEdit(row: TeacherRow, values: TeacherFormValues) {
    const result = await updateTeacher(user.id, row.teacher.id, values);
    if (result.ok) onNotice(`${values.name} was updated.`);
    return result;
  }

  async function moveTeacher(row: TeacherRow, managerId: string) {
    const result = await assignTeacherToManager(user.id, row.teacher.id, managerId || null);
    onNotice(result.ok ? `${row.teacher.name} now reports to ${managers.find((manager) => manager.id === managerId)?.name ?? "no manager"}${result.value.studentsMoved ? ` (${result.value.studentsMoved} student${result.value.studentsMoved === 1 ? "" : "s"} moved too)` : ""}.` : result.error);
  }

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{isAdmin ? "ALL TEACHERS" : "YOUR TEAM"}</p>
        <h1>Teachers</h1>
        <p className="subheading">{isAdmin ? "Every teacher in the school, with their manager and performance." : "The teachers you manage, their students, and how they are performing."}</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="primary-button" onClick={() => setDialog({ kind: "create" })}><Icon name="plus" size={15} /> Add teacher</button>
      </div>
    </section>

    <section className="panel student-panel">
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teachers or specialties…" aria-label="Search teachers" /></label>
        {isAdmin && <label className="student-select"><Icon name="filter" size={15} /><select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} aria-label="Filter by manager"><option value="all">All managers</option>{managers.map((manager) => <option value={manager.id} key={manager.id}>{manager.name}</option>)}<option value="none">No manager</option></select></label>}
        <span className="student-filter-count">Showing {filtered.length} of {rows.length} teachers</span>
      </div>
      <div className="manager-table" role="table" aria-label="Teachers">
        <div className={`manager-table-head ${isAdmin ? "with-manager" : ""}`} role="row">
          <span role="columnheader">Teacher</span>
          {isAdmin && <span role="columnheader">Manager</span>}
          <span role="columnheader">Students</span>
          <span role="columnheader">This week</span>
          <span role="columnheader">Performance</span>
          <span role="columnheader">Status</span>
        </div>
        {filtered.map((row) => <button type="button" role="row" className={`manager-table-row ${isAdmin ? "with-manager" : ""}`} key={row.teacher.id} onClick={() => setSelectedId(row.teacher.id)}>
          <span className="manager-person" role="cell"><PersonAvatar name={row.teacher.name} color={row.teacher.avatarColor} /><span><strong>{row.teacher.name}</strong><small>{row.profile?.headline ?? row.teacher.email}</small></span></span>
          {isAdmin && <span role="cell" className="manager-cell" data-label="Manager">{row.managerName}</span>}
          <span role="cell" className="manager-cell" data-label="Students">{row.students.length}</span>
          <span role="cell" className="manager-cell" data-label="This week">{row.lessonsThisWeek} lesson{row.lessonsThisWeek === 1 ? "" : "s"}</span>
          <span role="cell" className="manager-cell" data-label="Performance"><ScorePill performance={row.performance} /></span>
          <span role="cell" className="manager-cell" data-label="Status"><UserStatusBadge status={row.teacher.status} /></span>
        </button>)}
        {filtered.length === 0 && <div className="student-empty-inline"><Icon name="users" /><p>{rows.length ? "No teachers match your search." : "No teachers yet. Add your first teacher."}</p></div>}
      </div>
    </section>

    {selected && !dialog && <Modal eyebrow={isAdmin ? `TEACHER · ${selected.managerName.toUpperCase()}` : "TEACHER"} title={selected.teacher.name} description={`${selected.teacher.email}${selected.profile ? ` · since ${formatLessonDate(selected.profile.hireDate)}` : ""}`} onClose={() => setSelectedId(null)} size="wide"
      footer={<>
        <button type="button" className="cancel-button" onClick={() => setSelectedId(null)}>Close</button>
        {selected.canManage && <>
          {selected.teacher.status === "invited" ? <>
            {canResendInvite(user, selected.teacher) && <ResendInviteButton actorId={user.id} person={selected.teacher} onResult={showResend} />}
          </> : <>
            {isAdmin && !isDemoMode() && <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "reset-password", row: selected })}><Icon name="lock" size={14} /> Reset password</button>}
            <button type="button" className={selected.teacher.status === "active" ? "danger-outline-button" : "secondary-button"} onClick={() => setDialog({ kind: "status", row: selected })}>{selected.teacher.status === "active" ? "Pause" : "Reactivate"}</button>
          </>}
          <button type="button" className="primary-button" onClick={() => setDialog({ kind: "edit", row: selected })}><Icon name="edit" size={14} /> Edit</button>
        </>}
      </>}>
      <div className="manager-detail-stats">
        <div><span className="eyebrow">PERFORMANCE</span><ScorePill performance={selected.performance} /></div>
        <div><span className="eyebrow">RATINGS</span><strong>{selected.performance.ratings.count ? `${selected.performance.ratings.average.toFixed(1)} ★ · ${selected.performance.ratings.count}` : "None yet"}</strong></div>
        <div><span className="eyebrow">STUDENTS</span><strong>{selected.students.length}</strong></div>
        <div><span className="eyebrow">STATUS</span><UserStatusBadge status={selected.teacher.status} /></div>
      </div>
      {isAdmin && <div className="lesson-detail-section">
        <span className="eyebrow">MANAGER</span>
        <label className="student-select manager-inline-select"><Icon name="shield" size={15} /><select value={selected.managerId ?? ""} onChange={(event) => moveTeacher(selected, event.target.value)} aria-label="Manager">
          {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
          <option value="">No manager</option>
        </select></label>
        <p className="manager-help">Moving a teacher also moves their enrolled students and pending requests to the new manager.</p>
      </div>}
      {selected.profile && (selected.profile.bio || selected.profile.specializations.length > 0) && <div className="lesson-detail-section"><span className="eyebrow">PROFILE</span>{selected.profile.bio && <p>{selected.profile.bio}</p>}<div className="lesson-tags">{selected.profile.specializations.map((item) => <span key={item}>{item}</span>)}</div></div>}
      <div className="lesson-detail-section">
        <span className="eyebrow">STUDENTS</span>
        <div className="manager-chip-list">{selected.students.length ? selected.students.map((student) => <span className="manager-chip" key={student.id}><PersonAvatar name={student.name} color={student.avatarColor} size="small" />{student.name}</span>) : <p>No students yet. Enroll students from the Students page.</p>}</div>
      </div>
      <div className="lesson-detail-section">
        <span className="eyebrow">UPCOMING LESSONS</span>
        <div className="manager-mini-list">
          {selected.upcoming.map(({ lesson, student }) => <div key={lesson.id}><span>{formatLessonDate(lesson.date)} · {lesson.time}</span><strong>{lesson.title}</strong><small>{student}</small><LessonStatusBadge status={lesson.status} /></div>)}
          {selected.upcoming.length === 0 && <p>No upcoming lessons.</p>}
        </div>
      </div>
      {selected.canManage && <div className="lesson-detail-section">
        <span className="eyebrow">RECENT LESSONS · RECORD AN ABSENCE</span>
        <div className="manager-mini-list">
          {selected.recent.map(({ lesson, student }) => <div key={lesson.id}><span>{formatLessonDate(lesson.date)} · {lesson.time}</span><strong>{lesson.title}</strong><small>{student}</small>
            <button type="button" className="danger-outline-button compact-button" onClick={() => setDialog({ kind: "absence", lesson, label: `${lesson.title} with ${student} · ${formatLessonDate(lesson.date)} ${lesson.time}` })}>Absent</button>
          </div>)}
          {selected.recent.length === 0 && <p>No lessons in the last two weeks to review.</p>}
        </div>
      </div>}
    </Modal>}

    {inviteResult && <InviteResultModal actorId={user.id} person={inviteResult.person} invite={inviteResult.invite}
      canResend={canResendInvite(user, { ...inviteResult.person, status: "invited", avatarColor: "", createdAt: "" })} onClose={() => setInviteResult(null)} />}
    {dialog?.kind === "create" && <TeacherFormModal managers={isAdmin ? managers : undefined} onSubmit={submitCreate} onClose={() => setDialog(null)} />}
    {dialog?.kind === "edit" && <TeacherFormModal
      initial={{ name: dialog.row.teacher.name, email: dialog.row.teacher.email, headline: dialog.row.profile?.headline ?? "", specializations: dialog.row.profile?.specializations.join(", ") ?? "", bio: dialog.row.profile?.bio ?? "", managerId: dialog.row.managerId ?? "" }}
      onSubmit={(values) => submitEdit(dialog.row, values)} onClose={() => setDialog(null)} />}
    {dialog?.kind === "status" && <ConfirmStatusModal person={dialog.row.teacher} onClose={() => setDialog(null)} onConfirm={async () => {
      const pausing = dialog.row.teacher.status === "active";
      const result = await setPersonStatus(user.id, dialog.row.teacher.id, pausing ? "paused" : "active");
      if (result.ok) onNotice(`${dialog.row.teacher.name} was ${pausing ? "paused" : "reactivated"}.`);
      return result;
    }} />}
    {dialog?.kind === "reset-password" && <ResetPasswordModal person={dialog.row.teacher} onClose={() => setDialog(null)} onSubmit={async (password) => {
      const result = await resetPersonPassword(user.id, dialog.row.teacher.id, password);
      if (result.ok) onNotice(`${dialog.row.teacher.name}’s password was reset.`);
      return result;
    }} />}
    {dialog?.kind === "absence" && <AbsenceModal lessonLabel={dialog.label} onClose={() => setDialog(null)} onSubmit={async (note) => {
      const result = await recordTeacherAbsence(user.id, dialog.lesson.id, note);
      if (result.ok) onNotice("Absence recorded. The lesson is cancelled and the student refunded.");
      return result;
    }} />}
  </div>;
}
