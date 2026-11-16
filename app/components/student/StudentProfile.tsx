"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import type { BookableTutor } from "./useStudentWorkspace";
import type { Account, StudentProfile } from "../../lib/types";

type ProfileProps = {
  account: Account;
  profile: StudentProfile;
  /** The student's enrolled teacher from the shared store. */
  tutor?: BookableTutor;
  onSaveProfile: (profile: StudentProfile) => void;
  onUpdateAccount: (account: Account) => void;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
};

const timezones = ["Asia/Singapore (UTC+8)", "Asia/Tokyo (UTC+9)", "Europe/London (UTC+0)", "America/New_York (UTC-5)", "America/Los_Angeles (UTC-8)", "Australia/Sydney (UTC+11)"];
const languages = ["Mandarin Chinese", "Japanese", "Korean", "Spanish", "Portuguese", "Arabic", "Vietnamese", "Thai", "English"];
const levels = ["A1 Beginner", "A2 Elementary", "B1 Intermediate", "B2 Upper intermediate", "C1 Advanced", "C2 Proficient"];

export default function StudentProfile({ account, profile, tutor, onSaveProfile, onUpdateAccount, onNavigate, onRequestLogout, onNotice }: ProfileProps) {
  const [draft, setDraft] = useState<StudentProfile>(profile);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  const completion = useMemo(() => {
    const fields = [draft.name, draft.phone, draft.country, draft.nativeLanguage, draft.timezone, draft.bio, draft.currentLevel, draft.targetLevel, draft.learningGoal];
    return Math.round((fields.filter((value) => value && value.trim().length > 0).length / fields.length) * 100);
  }, [draft]);

  const changed = JSON.stringify(draft) !== JSON.stringify(profile);

  function saveProfile(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft.name.trim()) {
      onNotice("Your display name cannot be empty.");
      return;
    }
    const next = { ...draft, name: draft.name.trim(), email: account.email };
    onSaveProfile(next);
    onUpdateAccount({ ...account, name: next.name });
    onNotice("Profile updated.");
  }

  function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwords.current.trim()) {
      onNotice("Enter your current password.");
      return;
    }
    if (passwords.next.length < 8) {
      onNotice("Your new password must be at least 8 characters.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      onNotice("The new passwords do not match.");
      return;
    }
    setPasswords({ current: "", next: "", confirm: "" });
    onNotice("Password updated successfully.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">MY PROFILE</p><h1>Profile & learning plan</h1><p className="subheading">Keep your personal details and learning goals up to date.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Settings")}><Icon name="settings" size={15} /> Settings</button>
        <button type="button" className="primary-button" onClick={() => saveProfile()} disabled={!changed}><Icon name="save" size={15} /> Save changes</button>
      </div>
    </section>

    <section className="student-profile-hero">
      <div className="student-profile-avatar">
        <div className="avatar hero-avatar">{draft.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
        <button type="button" aria-label="Change profile photo" onClick={() => onNotice("Profile photo upload is ready for your school's media storage.")}><Icon name="camera" size={14} /></button>
      </div>
      <div className="student-profile-identity">
        <span className="student-profile-badge">STUDENT</span>
        <h2>{draft.name}</h2>
        <p>{draft.email} · Member since {draft.memberSince}</p>
        <div className="student-profile-tags"><span>{draft.currentLevel}</span><span>{draft.learningGoal}</span></div>
      </div>
      <div className="student-profile-completion">
        <div className="completion-ring" style={{ background: `conic-gradient(#4f46e5 ${completion}%, rgba(255,255,255,.25) ${completion}% 100%)` }}><span>{completion}%</span></div>
        <div><strong>Profile complete</strong><small>{completion === 100 ? "Everything looks good." : "Add the remaining details."}</small></div>
      </div>
    </section>

    <div className="student-profile-layout">
      <div className="student-profile-main">
        <form className="panel student-panel student-profile-form" onSubmit={saveProfile}>
          <div className="panel-header"><div><h2>Personal information</h2><p>How your tutor and school reach you</p></div></div>
          <div className="student-form-grid">
            <label>Full name<input id="profile-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label>Email address<input type="email" value={draft.email} disabled /><small>Contact your school admin to change your email.</small></label>
            <label>Phone number<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+65 8123 4567" /></label>
            <label>Country<input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} placeholder="Singapore" /></label>
            <label>Native language<select value={draft.nativeLanguage} onChange={(event) => setDraft({ ...draft, nativeLanguage: event.target.value })}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label>
            <label>Timezone<select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}>{timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></label>
            <label className="full-field">About you<textarea rows={4} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="What are you working towards? What helps you learn best?" /></label>
          </div>
          <div className="student-form-actions"><button type="button" className="cancel-button" onClick={() => setDraft(profile)} disabled={!changed}>Discard changes</button><button type="submit" className="primary-button" disabled={!changed}>Save profile</button></div>
        </form>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Learning plan</h2><p>Your current level and target outcome</p></div></div>
          <div className="student-form-grid">
            <label>Current level<select value={draft.currentLevel} onChange={(event) => setDraft({ ...draft, currentLevel: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
            <label>Target level<select value={draft.targetLevel} onChange={(event) => setDraft({ ...draft, targetLevel: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
            <label className="full-field">Learning goal<input value={draft.learningGoal} onChange={(event) => setDraft({ ...draft, learningGoal: event.target.value })} placeholder="e.g. Lead client meetings with confidence" /></label>
            <label>Weekly lesson target<input type="number" min={1} max={14} value={draft.weeklyGoal} onChange={(event) => setDraft({ ...draft, weeklyGoal: Number(event.target.value) })} /></label>
          </div>
          <div className="student-form-actions"><button type="button" className="text-button" onClick={() => onNavigate("Progress")}>View progress report <Icon name="arrow" size={14} /></button><button type="button" className="primary-button" disabled={!changed} onClick={() => saveProfile()}>Save learning plan</button></div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Password & security</h2><p>Use a strong password you do not reuse elsewhere</p></div><span className="metric-icon green"><Icon name="shield" /></span></div>
          <form className="student-form-grid" onSubmit={updatePassword}>
            <label className="full-field">Current password<input type="password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} autoComplete="current-password" /></label>
            <label>New password<input type="password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} autoComplete="new-password" placeholder="At least 8 characters" /></label>
            <label>Confirm new password<input type="password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} autoComplete="new-password" /></label>
            <div className="full-field student-form-actions"><button type="submit" className="secondary-button"><Icon name="lock" size={15} /> Update password</button></div>
          </form>
        </section>

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Session & account</h2><p>Sign out on this device. Your learning history and saved work stay safe.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out</button>
        </section>
      </div>

      <aside className="student-profile-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Your teacher</h2><p>{tutor ? "Who you are enrolled with" : "Not enrolled yet"}</p></div></div>
          {tutor ? <div className="student-tutor-card">
            <div className={`avatar avatar-${tutor.color}`}>{tutor.initials}</div>
            <div><strong>{tutor.name}</strong><small>{tutor.specialty}</small></div>
          </div> : <div className="student-empty-inline"><Icon name="user" /><p>Your school will enroll you with a teacher.</p></div>}
          <div className="student-tutor-actions"><button type="button" className="secondary-button full-width" onClick={() => onNotice(tutor ? `Message sent to ${tutor.name}.` : "You are not enrolled with a teacher yet.")}><Icon name="message" size={14} /> Message teacher</button>{tutor && <button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Book with {tutor.name.split(" ")[0]} <Icon name="arrow" size={14} /></button>}</div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Learning snapshot</h2><p>At a glance</p></div></div>
          <div className="student-profile-stats">
            <div><span>Current level</span><strong>{draft.currentLevel.split(" ")[0]}</strong></div>
            <div><span>Target level</span><strong>{draft.targetLevel.split(" ")[0]}</strong></div>
            <div><span>Weekly target</span><strong>{draft.weeklyGoal} lessons</strong></div>
            <div><span>Timezone</span><strong>{draft.timezone.split(" ")[0]}</strong></div>
          </div>
          <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Progress")}>Open progress <Icon name="arrow" size={14} /></button>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Preferences</h2><p>Notifications and schedule display</p></div></div>
          <div className="student-preference-list">
            <button type="button" onClick={() => onNavigate("Settings")}><span><Icon name="bell" size={15} /> Notifications</span><Icon name="chevronRight" size={14} /></button>
            <button type="button" onClick={() => onNavigate("Settings")}><span><Icon name="globe" size={15} /> Timezone & language</span><Icon name="chevronRight" size={14} /></button>
            <button type="button" onClick={() => onNavigate("Settings")}><span><Icon name="sliders" size={15} /> Schedule display</span><Icon name="chevronRight" size={14} /></button>
          </div>
        </section>
      </aside>
    </div>
  </div>;
}
