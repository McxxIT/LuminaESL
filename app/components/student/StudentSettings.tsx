"use client";

import { useState } from "react";
import Icon from "../Icon";
import Toggle from "./Toggle";
import { downloadTextFile } from "../../lib/student";
import type { StudentProfile, StudentSettings } from "../../lib/types";

type SettingsProps = {
  profile: StudentProfile;
  settings: StudentSettings;
  onSaveSettings: (settings: StudentSettings) => void;
  onResetWorkspace: () => void;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
};

export default function StudentSettings({ profile, settings, onSaveSettings, onResetWorkspace, onNavigate, onRequestLogout, onNotice }: SettingsProps) {
  const [draft, setDraft] = useState<StudentSettings>(settings);
  const [resetOpen, setResetOpen] = useState(false);

  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  const enabledNotifications = [draft.emailNotifications, draft.lessonReminders, draft.weeklySummary, draft.productUpdates, draft.autoJoinReminder].filter(Boolean).length;

  function save() {
    onSaveSettings(draft);
    onNotice("Settings saved.");
  }

  function exportData() {
    downloadTextFile("lumina-student-settings.json", JSON.stringify({ profile, settings: draft }, null, 2));
    onNotice("Your profile and settings were downloaded.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">SETTINGS</p><h1>Preferences & notifications</h1><p className="subheading">Choose how Lumina supports your schedule, learning, and communication.</p></div>
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
            <Toggle checked={draft.emailNotifications} onChange={(value) => setDraft({ ...draft, emailNotifications: value })} title="Email notifications" description="Receive important account and lesson updates by email." />
            <Toggle checked={draft.lessonReminders} onChange={(value) => setDraft({ ...draft, lessonReminders: value })} title="Lesson reminders" description="Get a reminder 1 hour before each scheduled lesson." />
            <Toggle checked={draft.weeklySummary} onChange={(value) => setDraft({ ...draft, weeklySummary: value })} title="Weekly progress summary" description="A Monday recap of lessons, practice, and tutor feedback." />
            <Toggle checked={draft.productUpdates} onChange={(value) => setDraft({ ...draft, productUpdates: value })} title="Product updates" description="Occasional news about new Lumina learning features." />
            <Toggle checked={draft.autoJoinReminder} onChange={(value) => setDraft({ ...draft, autoJoinReminder: value })} title="Classroom join reminder" description="Show a prominent countdown when a lesson is about to start." />
          </div>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Learning preferences</h2><p>Defaults used when booking and viewing lessons</p></div></div>
          <div className="student-settings-fields">
            <label>Default lesson length<select value={draft.defaultDuration} onChange={(event) => setDraft({ ...draft, defaultDuration: event.target.value as StudentSettings["defaultDuration"] })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
            <label>Interface language<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as StudentSettings["language"] })}><option>English</option><option>Spanish</option><option>Japanese</option><option>Korean</option></select></label>
          </div>
          <div className="student-settings-list">
            <Toggle checked={draft.compactSchedule} onChange={(value) => setDraft({ ...draft, compactSchedule: value })} title="Compact schedule" description="Show more lessons at once in schedule and lesson lists." />
            <Toggle checked={draft.showLocalTimezone} onChange={(value) => setDraft({ ...draft, showLocalTimezone: value })} title="Show my local timezone" description="Display your timezone alongside lesson times." />
          </div>
          <div className="student-settings-note"><Icon name="globe" size={16} /><span>Current timezone: <strong>{profile.timezone}</strong></span><button type="button" className="text-button" onClick={() => onNavigate("Profile")}>Change</button></div>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Appearance</h2><p>Choose how the workspace looks</p></div></div>
          <div className="student-theme-options">
            <button type="button" className={`theme-option ${draft.theme === "light" ? "active" : ""}`} onClick={() => setDraft({ ...draft, theme: "light" })}><span className="theme-preview light"><i /><i /><i /></span><span><strong>Light</strong><small>Bright, focused workspace</small></span>{draft.theme === "light" && <Icon name="check" size={16} />}</button>
            <button type="button" className={`theme-option ${draft.theme === "system" ? "active" : ""}`} onClick={() => setDraft({ ...draft, theme: "system" })}><span className="theme-preview system"><i /><i /><i /></span><span><strong>System</strong><small>Follow your device setting</small></span>{draft.theme === "system" && <Icon name="check" size={16} />}</button>
          </div>
          <p className="student-form-note">Theme follows the device preference when System is selected. The light workspace is optimized for long study sessions.</p>
        </section>

        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Data & privacy</h2><p>Download a copy of your profile and preferences</p></div></div>
          <div className="student-data-actions">
            <div><span className="metric-icon blue"><Icon name="download" /></span><div><strong>Export my data</strong><small>Download a JSON copy of your profile and settings.</small></div><button type="button" className="secondary-button" onClick={exportData}>Download</button></div>
            <div><span className="metric-icon orange"><Icon name="shield" /></span><div><strong>Privacy policy</strong><small>Review how your learning data is stored and used.</small></div><button type="button" className="secondary-button" onClick={() => onNotice("Privacy policy opened in a new tab.")}>Read policy</button></div>
          </div>
        </section>

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Sign out</h2><p>You can sign back in at any time. Your lesson history and preferences are saved.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out of Lumina</button>
        </section>

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">SESSION</span><h2>Reset demo workspace</h2><p>Clear locally saved lessons, assignments, practice results, and preferences for this account.</p></div>
          {resetOpen ? <div className="inline-confirm"><span>Reset all local data?</span><button type="button" className="cancel-button" onClick={() => setResetOpen(false)}>Keep my data</button><button type="button" className="danger-button" onClick={() => { setResetOpen(false); onResetWorkspace(); onNotice("Workspace reset to defaults."); }}>Reset</button></div> : <button type="button" className="danger-outline-button" onClick={() => setResetOpen(true)}><Icon name="trash" size={15} /> Reset data</button>}
        </section>
      </div>

      <aside className="student-settings-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Settings summary</h2><p>What will change</p></div></div>
          <div className="student-settings-summary">
            <div><Icon name="bell" size={15} /><span>Notifications</span><strong>{enabledNotifications} on</strong></div>
            <div><Icon name="clock" size={15} /><span>Lesson length</span><strong>{draft.defaultDuration} min</strong></div>
            <div><Icon name="globe" size={15} /><span>Language</span><strong>{draft.language}</strong></div>
            <div><Icon name="sliders" size={15} /><span>Compact mode</span><strong>{draft.compactSchedule ? "On" : "Off"}</strong></div>
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
          <div><strong>Small settings, big difference</strong><p>Keeping lesson reminders on helps students attend 32% more sessions on average.</p></div>
        </section>
      </aside>
    </div>
  </div>;
}
