"use client";

import { useState } from "react";
import Icon from "../Icon";
import PasswordChangeCard from "../shared/PasswordChangeCard";
import Toggle from "../student/Toggle";
import { isApiDataMode } from "../../lib/auth/mode";
import { downloadTextFile } from "../../lib/student";
import type { TeacherProfile, TeacherSettings } from "../../lib/types";

type SettingsProps = {
  profile: TeacherProfile;
  settings: TeacherSettings;
  onSaveSettings: (settings: TeacherSettings) => void;
  onResetWorkspace: () => void;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
};

export default function TeacherSettingsPage({ profile, settings, onSaveSettings, onResetWorkspace, onNavigate, onRequestLogout, onNotice }: SettingsProps) {
  const [draft, setDraft] = useState<TeacherSettings>(settings);
  const [resetOpen, setResetOpen] = useState(false);

  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  const enabledNotifications = [draft.emailNotifications, draft.lessonReminders, draft.newBookingAlerts, draft.studentMessages, draft.weeklySummary].filter(Boolean).length;

  function save() {
    onSaveSettings(draft);
    onNotice("Settings saved.");
  }

  function exportData() {
    downloadTextFile("lumina-teacher-settings.json", JSON.stringify({ profile, settings: draft }, null, 2));
    onNotice("Your profile and settings were downloaded.");
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">SETTINGS</p><h1>Teaching preferences</h1><p className="subheading">Choose how Lumina handles your schedule, bookings, and communication.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => { setDraft(settings); onNotice("Unsaved settings were discarded."); }} disabled={!changed}>Reset</button>
        <button type="button" className="primary-button" onClick={save} disabled={!changed}><Icon name="save" size={15} /> Save settings</button>
      </div>
    </section>

    <div className="student-settings-layout">
      <div className="student-settings-main">
        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Notifications</h2><p>Choose what Lumina should send you</p></div><span className="setting-count">{enabledNotifications} enabled</span></div>
          <div className="student-settings-list">
            <Toggle checked={draft.emailNotifications} onChange={(value) => setDraft({ ...draft, emailNotifications: value })} title="Email notifications" description="Receive important account and teaching updates by email." />
            <Toggle checked={draft.lessonReminders} onChange={(value) => setDraft({ ...draft, lessonReminders: value })} title="Lesson reminders" description="Get a reminder 30 minutes before each scheduled lesson." />
            <Toggle checked={draft.newBookingAlerts} onChange={(value) => setDraft({ ...draft, newBookingAlerts: value })} title="New booking alerts" description="Know immediately when a student books an available slot." />
            <Toggle checked={draft.studentMessages} onChange={(value) => setDraft({ ...draft, studentMessages: value })} title="Student messages" description="Receive a notification when a student sends a message." />
            <Toggle checked={draft.weeklySummary} onChange={(value) => setDraft({ ...draft, weeklySummary: value })} title="Weekly teaching summary" description="A Monday recap of lessons, attendance, and student progress." />
          </div>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Scheduling preferences</h2><p>Defaults used when adding and rescheduling lessons</p></div></div>
          <div className="student-settings-fields">
            <label>Lesson length<select value={draft.defaultDuration} onChange={(event) => setDraft({ ...draft, defaultDuration: event.target.value as TeacherSettings["defaultDuration"] })}><option value="25">25 minutes</option></select></label>
            <label>Buffer between lessons<select value={draft.bufferMinutes} onChange={(event) => setDraft({ ...draft, bufferMinutes: event.target.value as TeacherSettings["bufferMinutes"] })}><option value="0">No buffer</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label>
            <label>Interface language<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as TeacherSettings["language"] })}><option>English</option><option>Spanish</option><option>Japanese</option><option>Korean</option></select></label>
          </div>
          <div className="student-settings-list">
            <Toggle checked={draft.autoAcceptBookings} onChange={(value) => setDraft({ ...draft, autoAcceptBookings: value })} title="Auto-accept bookings" description="Confirm new bookings automatically inside your open 25-minute slots." />
            <Toggle checked={draft.compactSchedule} onChange={(value) => setDraft({ ...draft, compactSchedule: value })} title="Compact schedule" description="Show more lessons at once in schedule and lesson lists." />
            <Toggle checked={draft.showLocalTimezone} onChange={(value) => setDraft({ ...draft, showLocalTimezone: value })} title="Show my local timezone" description="Display your timezone alongside lesson times." />
          </div>
          <div className="student-settings-note"><Icon name="globe" size={16} /><span>Current timezone: <strong>{profile.timezone}</strong></span><button type="button" className="text-button" onClick={() => onNavigate("Profile")}>Change</button></div>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Booking rules</h2><p>Slots are closed by default, opening is instant, and closures need manager review</p></div><button type="button" className="text-button" onClick={() => onNavigate("Booking slots")}>Manage <Icon name="arrow" size={14} /></button></div>
          <div className="teacher-booking-rules">
            <div><Icon name="clock" size={16} /><span><strong>25 minutes per booking</strong><small>Students book one open slot at a time.</small></span></div>
            <div><Icon name="calendar" size={16} /><span><strong>08:00–23:30 daily</strong><small>Every day starts closed until you open the slots you want to teach.</small></span></div>
            <div><Icon name="lock" size={16} /><span><strong>Opening is instant</strong><small>Open any slot for bookings without manager approval.</small></span></div>
            <div><Icon name="lock" size={16} /><span><strong>Approval for closures</strong><small>Add a reason before an open slot can be closed.</small></span></div>
          </div>
          <p className="student-form-note">Weekly availability has been replaced by individual booking slots on the Booking slots page.</p>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Appearance</h2><p>Choose how the workspace looks</p></div></div>
          <div className="student-theme-options">
            <button type="button" className={`theme-option ${draft.theme === "light" ? "active" : ""}`} onClick={() => setDraft({ ...draft, theme: "light" })}><span className="theme-preview light"><i /><i /><i /></span><span><strong>Light</strong><small>Bright, focused workspace</small></span>{draft.theme === "light" && <Icon name="check" size={16} />}</button>
            <button type="button" className={`theme-option ${draft.theme === "system" ? "active" : ""}`} onClick={() => setDraft({ ...draft, theme: "system" })}><span className="theme-preview system"><i /><i /><i /></span><span><strong>System</strong><small>Follow your device setting</small></span>{draft.theme === "system" && <Icon name="check" size={16} />}</button>
          </div>
          <p className="student-form-note">Theme follows the device preference when System is selected. The light workspace is optimized for long teaching days.</p>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Data & privacy</h2><p>Download a copy of your profile and teaching settings</p></div></div>
          <div className="student-data-actions">
            <div><span className="metric-icon blue"><Icon name="download" /></span><div><strong>Export my data</strong><small>Download a JSON copy of your teacher workspace settings.</small></div><button type="button" className="secondary-button" onClick={exportData}>Download</button></div>
            <div><span className="metric-icon orange"><Icon name="shield" /></span><div><strong>Privacy policy</strong><small>Review how student and teaching data is stored and used.</small></div><button type="button" className="secondary-button" onClick={() => onNotice("Privacy policy opened in a new tab.")}>Read policy</button></div>
          </div>
        </section>

        <PasswordChangeCard onNotice={onNotice} />

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Sign out</h2><p>You can sign back in at any time. Your lessons, students, and notes are saved.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out of Lumina</button>
        </section>

        {!isApiDataMode() && <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">SESSION</span><h2>Reset demo workspace</h2><p>Restore the demo school for everyone (lessons, slots, requests, credits) and reset this account&apos;s notes and preferences.</p></div>
          {resetOpen ? <div className="inline-confirm"><span>Reset the demo school for every account?</span><button type="button" className="cancel-button" onClick={() => setResetOpen(false)}>Keep my data</button><button type="button" className="danger-button" onClick={() => { setResetOpen(false); onResetWorkspace(); onNotice("Workspace reset to defaults."); }}>Reset</button></div> : <button type="button" className="danger-outline-button" onClick={() => setResetOpen(true)}><Icon name="trash" size={15} /> Reset data</button>}
        </section>}
      </div>

      <aside className="student-settings-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Settings summary</h2><p>What will change</p></div></div>
          <div className="student-settings-summary">
            <div><Icon name="bell" size={15} /><span>Notifications</span><strong>{enabledNotifications} on</strong></div>
            <div><Icon name="clock" size={15} /><span>Lesson length</span><strong>{draft.defaultDuration} min</strong></div>
            <div><Icon name="sliders" size={15} /><span>Buffer</span><strong>{draft.bufferMinutes} min</strong></div>
            <div><Icon name="calendar" size={15} /><span>Auto-accept</span><strong>{draft.autoAcceptBookings ? "On" : "Off"}</strong></div>
            <div><Icon name="globe" size={15} /><span>Language</span><strong>{draft.language}</strong></div>
          </div>
          <button type="button" className="primary-button full-width" onClick={save} disabled={!changed}>Save settings</button>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Need help?</h2><p>We are here for you</p></div></div>
          <div className="student-help-links">
            <button type="button" onClick={() => onNotice("Getting started guide opened.")}><Icon name="book" size={15} /> Getting started</button>
            <button type="button" onClick={() => onNotice("Support request form opened.")}><Icon name="message" size={15} /> Contact support</button>
            <button type="button" onClick={() => onNavigate("Profile")}><Icon name="user" size={15} /> Back to profile</button>
          </div>
        </section>

        <section className="panel student-panel student-settings-tip">
          <span className="metric-icon green"><Icon name="zap" /></span>
          <div><strong>Protect your prep time</strong><p>A 15-minute buffer between lessons keeps feedback and notes from slipping.</p></div>
        </section>
      </aside>
    </div>
  </div>;
}
