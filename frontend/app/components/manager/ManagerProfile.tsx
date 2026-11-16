"use client";

import { useCallback, useState, type FormEvent } from "react";
import Icon from "../Icon";
import { DEFAULT_STAFF_PREFERENCES, staffPreferencesKey, type StaffPreferences } from "../../lib/hooks/useNotifications";
import { usePersonalValue } from "../../lib/hooks/usePersonalValue";
import { useSchool } from "../../lib/hooks/useSchool";
import { lessonsForUser, pendingRequestsForUser, studentsForUser, teachersForUser, usersByRole, type SchoolData, type SchoolUser } from "../../lib/school";
import { updateMyName } from "../../lib/school/services";
import { initials, isoDaysFromNow, todayISO } from "../../lib/student";
import type { Account } from "../../lib/types";

function selectScope(data: SchoolData, user: SchoolUser) {
  const weekEnd = isoDaysFromNow(7);
  const today = todayISO();
  return {
    managers: usersByRole(data, "manager").length,
    teachers: teachersForUser(data, user).length,
    students: studentsForUser(data, user).length,
    lessonsThisWeek: lessonsForUser(data, user).filter((lesson) => lesson.status !== "cancelled" && lesson.date >= today && lesson.date <= weekEnd).length,
    pending: pendingRequestsForUser(data, user).length,
  };
}

/** Profile page for the admin and managers: name (shared), contact details, and their scope. */
export default function ManagerProfile({ user, account, onUpdateAccount, onNavigate, onRequestLogout, onNotice }: {
  user: SchoolUser;
  account: Account;
  onUpdateAccount: (account: Account) => void;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
}) {
  const isAdmin = user.role === "admin";
  const [prefs, setPrefs] = usePersonalValue<StaffPreferences>(staffPreferencesKey(user.email), DEFAULT_STAFF_PREFERENCES);
  const [draft, setDraft] = useState({ name: user.name, title: prefs.title, phone: prefs.phone, bio: prefs.bio });
  const [error, setError] = useState("");
  const select = useCallback((data: SchoolData) => selectScope(data, user), [user]);
  const scope = useSchool(select);
  const changed = draft.name !== user.name || draft.title !== prefs.title || draft.phone !== prefs.phone || draft.bio !== prefs.bio;
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const result = updateMyName(user.id, draft.name);
    if (!result.ok) return setError(result.error);
    setError("");
    setPrefs((current) => ({ ...current, title: draft.title.trim(), phone: draft.phone.trim(), bio: draft.bio.trim() }));
    onUpdateAccount({ ...account, name: draft.name.trim().replace(/\s+/g, " ") });
    onNotice("Profile saved. Your name is updated everywhere in the school.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">MY PROFILE</p><h1>Profile</h1><p className="subheading">How teachers, students, and other managers see you.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Settings")}><Icon name="settings" size={15} /> Settings</button>
        <button type="button" className="primary-button" onClick={() => save()} disabled={!changed}><Icon name="save" size={15} /> Save changes</button>
      </div>
    </section>

    <section className="student-profile-hero">
      <div className="student-profile-avatar"><div className="avatar hero-avatar">{initials(draft.name || user.name)}</div></div>
      <div className="student-profile-identity">
        <span className="student-profile-badge">{isAdmin ? "SCHOOL ADMIN" : "MANAGER"}</span>
        <h2>{draft.name || user.name}</h2>
        <p>{user.email} · Member since {memberSince}</p>
        <div className="student-profile-tags">{draft.title && <span>{draft.title}</span>}<span>{isAdmin ? "Whole school" : `${scope.teachers} teacher${scope.teachers === 1 ? "" : "s"} on your team`}</span></div>
      </div>
    </section>

    <div className="student-profile-layout">
      <div className="student-profile-main">
        <form className="panel student-panel student-profile-form" onSubmit={save} noValidate>
          <div className="panel-header"><div><h2>Personal information</h2><p>Your name is shown to everyone in the school</p></div></div>
          <div className="student-form-grid">
            <label>Full name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Email address<input type="email" value={user.email} disabled /><small>{isAdmin ? "Your sign-in email cannot be changed here." : "Ask the school admin to change your email."}</small></label>
            <label>Job title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={isAdmin ? "e.g. Head of school" : "e.g. Academic manager"} /></label>
            <label>Phone number<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+65 8123 4567" /></label>
            <label className="full-field">About you<textarea rows={3} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="A short introduction for your teachers." /></label>
          </div>
          {error && <p className="form-error manager-profile-error" role="alert"><Icon name="x" size={14} /> {error}</p>}
          <div className="student-form-actions"><button type="button" className="cancel-button" onClick={() => setDraft({ name: user.name, title: prefs.title, phone: prefs.phone, bio: prefs.bio })} disabled={!changed}>Discard changes</button><button type="submit" className="primary-button" disabled={!changed}>Save profile</button></div>
        </form>

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Session</h2><p>Sign out on this device. Everything you manage stays saved.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out</button>
        </section>
      </div>

      <aside className="student-profile-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>{isAdmin ? "Your school" : "Your team"}</h2><p>What you look after</p></div></div>
          <div className="manager-scope-list">
            {isAdmin && <button type="button" onClick={() => onNavigate("Managers")}><Icon name="shield" size={16} /><span>Managers</span><strong>{scope.managers}</strong></button>}
            <button type="button" onClick={() => onNavigate("Teachers")}><Icon name="users" size={16} /><span>Teachers</span><strong>{scope.teachers}</strong></button>
            <button type="button" onClick={() => onNavigate("Students")}><Icon name="user" size={16} /><span>Students</span><strong>{scope.students}</strong></button>
            <button type="button" onClick={() => onNavigate("Schedule")}><Icon name="calendar" size={16} /><span>Lessons in the next 7 days</span><strong>{scope.lessonsThisWeek}</strong></button>
            <button type="button" onClick={() => onNavigate("Approvals")}><Icon name="check" size={16} /><span>Pending approvals</span><strong className={scope.pending ? "manager-low" : ""}>{scope.pending}</strong></button>
          </div>
        </section>
      </aside>
    </div>
  </div>;
}
