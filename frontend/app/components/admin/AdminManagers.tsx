"use client";

import { useCallback, useState } from "react";
import Icon from "../Icon";
import { ConfirmStatusModal, EMAIL_INVITED_NOTE, ManagerFormModal, ResetPasswordModal } from "../manager/PeopleForms";
import { isDemoMode } from "../../lib/auth/mode";
import { PersonAvatar, ScorePill, UserStatusBadge } from "../manager/parts";
import { InviteResultModal, ResendInviteButton, canResendInvite, type InviteResult } from "../manager/InviteForms";
import type { InviteOutcome } from "../../lib/api/types";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  lessonsForUser,
  managerIdForTeacher,
  pendingRequestsForUser,
  performanceForTeacher,
  studentsForUser,
  teachersForUser,
  usersByRole,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { createManager, resetPersonPassword, setPersonStatus, updateManager } from "../../lib/school/services";
import { todayISO } from "../../lib/student";

function selectManagers(data: SchoolData) {
  const today = todayISO();
  const unassigned = usersByRole(data, "teacher").filter((teacher) => !managerIdForTeacher(data, teacher.id));
  return {
    unassigned,
    rows: usersByRole(data, "manager").map((manager) => {
      const teachers = teachersForUser(data, manager);
      return {
        manager,
        teachers: teachers.map((teacher) => ({ teacher, performance: performanceForTeacher(data, teacher.id) })),
        studentCount: studentsForUser(data, manager).length,
        lessonsToday: lessonsForUser(data, manager).filter((lesson) => lesson.date === today).length,
        pending: pendingRequestsForUser(data, manager).length,
      };
    }),
  };
}

type Dialog = { kind: "create" } | { kind: "edit" | "status" | "reset-password"; manager: SchoolUser } | null;

/** Admin-only: managers, their teams, and teachers waiting for a manager. */
export default function AdminManagers({ user, onNavigate, onNotice }: { user: SchoolUser; onNavigate: (page: string) => void; onNotice: (message: string) => void }) {
  const select = useCallback((data: SchoolData) => selectManagers(data), []);
  const { rows, unassigned } = useSchool(select);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);

  function showResend(person: SchoolUser, result: { ok: true; value: InviteOutcome } | { ok: false; error: string }) {
    if (result.ok) setInviteResult({ person, invite: result.value });
    else onNotice(result.error);
  }

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">SCHOOL ADMIN</p>
        <h1>Managers</h1>
        <p className="subheading">Each manager looks after their own teachers, students, and approvals. Move teachers between managers from Teachers.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Teachers")}><Icon name="users" size={15} /> Teachers</button>
        <button type="button" className="primary-button" onClick={() => setDialog({ kind: "create" })}><Icon name="plus" size={15} /> Add manager</button>
      </div>
    </section>

    {unassigned.length > 0 && <section className="panel student-panel manager-unassigned">
      <span className="metric-icon orange"><Icon name="users" /></span>
      <div><strong>{unassigned.length} teacher{unassigned.length === 1 ? " has" : "s have"} no manager</strong><p>{unassigned.map((teacher) => teacher.name).join(", ")}. Their requests only reach you until they are assigned.</p></div>
      <button type="button" className="secondary-button compact-button" onClick={() => onNavigate("Teachers")}>Assign <Icon name="arrow" size={14} /></button>
    </section>}

    <section className="manager-card-grid">
      {rows.map((row) => <article className={`panel manager-card ${row.manager.status !== "active" ? "is-paused" : ""}`} key={row.manager.id}>
        <header className="manager-card-head">
          <PersonAvatar name={row.manager.name} color={row.manager.avatarColor} />
          <div><strong>{row.manager.name}</strong><small>{row.manager.email}</small></div>
          <UserStatusBadge status={row.manager.status} />
        </header>
        <div className="manager-card-stats">
          <div><span>TEACHERS</span><strong>{row.teachers.length}</strong></div>
          <div><span>STUDENTS</span><strong>{row.studentCount}</strong></div>
          <div><span>LESSONS TODAY</span><strong>{row.lessonsToday}</strong></div>
          <div><span>PENDING</span><strong className={row.pending ? "manager-low" : ""}>{row.pending}</strong></div>
        </div>
        <div className="manager-card-team">
          {row.teachers.map(({ teacher, performance }) => <div key={teacher.id}><PersonAvatar name={teacher.name} color={teacher.avatarColor} size="small" /><span>{teacher.name}</span><ScorePill performance={performance} /></div>)}
          {row.teachers.length === 0 && <p>No teachers assigned yet.</p>}
        </div>
        <footer className="manager-card-actions">
          {row.manager.status === "invited" ? <>
            {canResendInvite(user, row.manager) && <ResendInviteButton actorId={user.id} person={row.manager} onResult={showResend} compact />}
          </> : <>
            <button type="button" className={row.manager.status === "active" ? "danger-outline-button compact-button" : "secondary-button compact-button"} onClick={() => setDialog({ kind: "status", manager: row.manager })}>{row.manager.status === "active" ? "Pause" : "Reactivate"}</button>
            {!isDemoMode() && <button type="button" className="secondary-button compact-button" onClick={() => setDialog({ kind: "reset-password", manager: row.manager })}><Icon name="lock" size={14} /> Reset password</button>}
          </>}
          <button type="button" className="secondary-button compact-button" onClick={() => setDialog({ kind: "edit", manager: row.manager })}><Icon name="edit" size={14} /> Edit</button>
        </footer>
      </article>)}
      {rows.length === 0 && <section className="panel student-panel"><div className="student-empty-inline"><Icon name="shield" /><p>No managers yet. Add one to start building teams.</p></div></section>}
    </section>

    {inviteResult && <InviteResultModal actorId={user.id} person={inviteResult.person} invite={inviteResult.invite} canResend onClose={() => setInviteResult(null)} />}
    {dialog?.kind === "create" && <ManagerFormModal onClose={() => setDialog(null)} onSubmit={async (values) => {
      const result = await createManager(user.id, values);
      if (result.ok) {
        if (result.value.invite) setInviteResult({ person: result.value, invite: result.value.invite });
        else onNotice(`${result.value.name} was added. Assign teachers to them from Teachers.`);
      }
      return result;
    }} />}
    {dialog?.kind === "edit" && <ManagerFormModal initial={{ name: dialog.manager.name, email: dialog.manager.email }}
      emailNote={dialog.manager.status === "invited" ? EMAIL_INVITED_NOTE : undefined}
      onClose={() => setDialog(null)} onSubmit={async (values) => {
      const result = await updateManager(user.id, dialog.manager.id, values);
      if (result.ok) {
        onNotice(result.value.warning ?? `${values.name} was updated.`);
        if (result.value.invite) {
          setInviteResult({ person: { ...dialog.manager, email: values.email.trim().toLowerCase() }, invite: result.value.invite });
        }
      }
      return result;
    }} />}
    {dialog?.kind === "reset-password" && <ResetPasswordModal person={dialog.manager} onClose={() => setDialog(null)} onSubmit={async (password) => {
      const result = await resetPersonPassword(user.id, dialog.manager.id, password);
      if (result.ok) onNotice(`${dialog.manager.name}’s password was reset.`);
      return result;
    }} />}
    {dialog?.kind === "status" && <ConfirmStatusModal person={dialog.manager} onClose={() => setDialog(null)} onConfirm={async () => {
      const pausing = dialog.manager.status === "active";
      const result = await setPersonStatus(user.id, dialog.manager.id, pausing ? "paused" : "active");
      if (result.ok) onNotice(`${dialog.manager.name} was ${pausing ? "paused" : "reactivated"}.`);
      return result;
    }} />}
  </div>;
}
