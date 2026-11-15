"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import type { Account, TeacherAvailability, TeacherProfile, TeacherStudent } from "../../lib/types";

type ProfileProps = {
  account: Account;
  profile: TeacherProfile;
  students: TeacherStudent[];
  availability: TeacherAvailability[];
  onSaveProfile: (profile: TeacherProfile) => void;
  onUpdateAccount: (account: Account) => void;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
};

const timezones = ["Asia/Singapore (UTC+8)", "Asia/Tokyo (UTC+9)", "Europe/London (UTC+0)", "America/New_York (UTC-5)", "America/Los_Angeles (UTC-8)", "Australia/Sydney (UTC+11)"];
const dayLabels: Record<TeacherAvailability["day"], string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function TeacherProfilePage({ account, profile, students, availability, onSaveProfile, onUpdateAccount, onNavigate, onRequestLogout, onNotice }: ProfileProps) {
  const [draft, setDraft] = useState<TeacherProfile>(profile);
  const [specialtiesText, setSpecialtiesText] = useState(profile.specializations.join(", "));
  const [languagesText, setLanguagesText] = useState(profile.languages.join(", "));
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  const changed = JSON.stringify(draft) !== JSON.stringify(profile)
    || specialtiesText !== profile.specializations.join(", ")
    || languagesText !== profile.languages.join(", ");

  const completion = useMemo(() => {
    const fields = [draft.name, draft.phone, draft.country, draft.timezone, draft.headline, draft.bio, draft.certifications, specialtiesText, languagesText, String(draft.yearsExperience)];
    return Math.round((fields.filter((value) => value && value.trim().length > 0).length / fields.length) * 100);
  }, [draft, languagesText, specialtiesText]);

  const activeStudents = students.filter((student) => student.status !== "paused");
  const averageProgress = Math.round(activeStudents.reduce((total, student) => total + student.progress, 0) / Math.max(activeStudents.length, 1));
  const activeSlots = availability.filter((slot) => slot.active);

  function discard() {
    setDraft(profile);
    setSpecialtiesText(profile.specializations.join(", "));
    setLanguagesText(profile.languages.join(", "));
    onNotice("Unsaved profile changes were discarded.");
  }

  function saveProfile(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft.name.trim()) {
      onNotice("Your display name cannot be empty.");
      return;
    }
    if (!specialtiesText.trim()) {
      onNotice("Add at least one specialization.");
      return;
    }
    const next: TeacherProfile = {
      ...draft,
      name: draft.name.trim(),
      email: account.email,
      headline: draft.headline.trim(),
      specializations: splitList(specialtiesText),
      languages: splitList(languagesText),
      weeklyGoalHours: Math.max(1, Number(draft.weeklyGoalHours) || 1),
    };
    onSaveProfile(next);
    onUpdateAccount({ ...account, name: next.name });
    setDraft(next);
    setSpecialtiesText(next.specializations.join(", "));
    setLanguagesText(next.languages.join(", "));
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

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHER PROFILE</p><h1>Profile & teaching focus</h1><p className="subheading">Keep your public profile, specialties, and teaching goals current.</p></div>
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
        <span className="student-profile-badge">TEACHER</span>
        <h2>{draft.name}</h2>
        <p>{draft.email} · Member since {draft.memberSince}</p>
        <div className="student-profile-tags"><span>{draft.headline}</span><span>{draft.yearsExperience} years teaching</span></div>
      </div>
      <div className="student-profile-completion">
        <div className="completion-ring" style={{ background: `conic-gradient(#4f46e5 ${completion}%, rgba(255,255,255,.25) ${completion}% 100%)` }}><span>{completion}%</span></div>
        <div><strong>Profile complete</strong><small>{completion === 100 ? "Everything looks good." : "Add the remaining details."}</small></div>
      </div>
    </section>

    <div className="student-profile-layout">
      <div className="student-profile-main">
        <form className="panel student-panel student-profile-form" onSubmit={saveProfile}>
          <div className="panel-header"><div><h2>Teacher profile</h2><p>How students and your school see you</p></div></div>
          <div className="student-form-grid">
            <label>Full name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label>Email address<input type="email" value={draft.email} disabled /><small>Contact your school admin to change your email.</small></label>
            <label>Phone number<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+65 9123 7788" /></label>
            <label>Country<input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} placeholder="Singapore" /></label>
            <label>Timezone<select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}>{timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></label>
            <label>Years of experience<input type="number" min={0} max={50} value={draft.yearsExperience} onChange={(event) => setDraft({ ...draft, yearsExperience: Number(event.target.value) })} /></label>
            <label className="full-field">Headline<input value={draft.headline} onChange={(event) => setDraft({ ...draft, headline: event.target.value })} placeholder="e.g. Business English and conversation coach" /></label>
            <label className="full-field">About you<textarea rows={4} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="How do you help students learn?" /></label>
          </div>
          <div className="student-form-actions"><button type="button" className="cancel-button" onClick={discard} disabled={!changed}>Discard changes</button><button type="submit" className="primary-button" disabled={!changed}>Save profile</button></div>
        </form>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Teaching focus</h2><p>Specialties, languages, and weekly capacity</p></div></div>
          <div className="student-form-grid">
            <label className="full-field">Specializations<input value={specialtiesText} onChange={(event) => setSpecialtiesText(event.target.value)} placeholder="Business English, Conversation, Pronunciation" /><small>Separate with commas.</small></label>
            <label className="full-field">Languages<input value={languagesText} onChange={(event) => setLanguagesText(event.target.value)} placeholder="English, Mandarin Chinese" /><small>Separate with commas.</small></label>
            <label>Certifications<input value={draft.certifications} onChange={(event) => setDraft({ ...draft, certifications: event.target.value })} placeholder="CELTA, DELTA Module 1" /></label>
            <label>Weekly teaching goal<input type="number" min={1} max={60} value={draft.weeklyGoalHours} onChange={(event) => setDraft({ ...draft, weeklyGoalHours: Number(event.target.value) })} /><small>Hours per week.</small></label>
          </div>
          <div className="student-form-actions"><button type="button" className="text-button" onClick={() => onNavigate("Schedule")}>Manage availability <Icon name="arrow" size={14} /></button><button type="button" className="primary-button" disabled={!changed} onClick={() => saveProfile()}>Save teaching focus</button></div>
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
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Session & account</h2><p>Sign out on this device. Your lessons, notes, and curriculum stay safe.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out</button>
        </section>
      </div>

      <aside className="student-profile-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Teaching snapshot</h2><p>At a glance</p></div></div>
          <div className="student-profile-stats">
            <div><span>Active students</span><strong>{activeStudents.length}</strong></div>
            <div><span>Average progress</span><strong>{averageProgress}%</strong></div>
            <div><span>Weekly goal</span><strong>{draft.weeklyGoalHours} hrs</strong></div>
            <div><span>Timezone</span><strong>{draft.timezone.split(" ")[0]}</strong></div>
          </div>
          <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Analytics")}>Open analytics <Icon name="arrow" size={14} /></button>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Availability</h2><p>{activeSlots.length} open block{activeSlots.length === 1 ? "" : "s"}</p></div></div>
          <div className="teacher-availability-mini">
            {activeSlots.slice(0, 5).map((slot) => <div className="teacher-availability-row" key={slot.id}>
              <span className="teacher-availability-dot" /><span>{dayLabels[slot.day]}</span><strong>{slot.startTime}–{slot.endTime}</strong>
            </div>)}
            {activeSlots.length === 0 && <div className="student-empty-inline"><Icon name="clock" /><p>No open availability blocks.</p></div>}
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Schedule")}>Edit availability <Icon name="arrow" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Preferences</h2><p>Notifications and schedule display</p></div></div>
          <div className="student-preference-list">
            <button type="button" onClick={() => onNavigate("Settings")}><span><Icon name="bell" size={15} /> Notifications</span><Icon name="chevronRight" size={14} /></button>
            <button type="button" onClick={() => onNavigate("Settings")}><span><Icon name="globe" size={15} /> Timezone & language</span><Icon name="chevronRight" size={14} /></button>
            <button type="button" onClick={() => onNavigate("Schedule")}><span><Icon name="sliders" size={15} /> Availability defaults</span><Icon name="chevronRight" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel student-settings-tip">
          <span className="metric-icon green"><Icon name="sparkles" /></span>
          <div><strong>Students notice consistency</strong><p>A short note after each lesson is one of the strongest predictors of retention.</p></div>
        </section>
      </aside>
    </div>
  </div>;
}
