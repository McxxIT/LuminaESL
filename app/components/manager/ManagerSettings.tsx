"use client";

import { useState } from "react";
import Icon from "../Icon";
import Toggle from "../student/Toggle";
import { DEFAULT_STAFF_PREFERENCES, staffPreferencesKey, type StaffPreferences } from "../../lib/hooks/useNotifications";
import { usePersonalValue } from "../../lib/hooks/usePersonalValue";
import { resetSchool, type NotificationCategory, type SchoolUser } from "../../lib/school";

const categories: { key: NotificationCategory; title: string; description: string }[] = [
  { key: "approvals", title: "Requests waiting for approval", description: "Slot closures and lesson cancellations from your teachers." },
  { key: "credits", title: "Students running low on credits", description: "Fewer than two lessons left." },
  { key: "plans", title: "Lessons without a plan", description: "Booked lessons in the next 7 days that have no lesson plan." },
  { key: "quality", title: "Low ratings", description: "2-star or lower ratings from students or parents in the last week." },
];

/** Settings for the admin and managers: which notifications to get, session, and (admin) demo reset. */
export default function ManagerSettings({ user, onNavigate, onRequestLogout, onNotice }: {
  user: SchoolUser;
  onNavigate: (page: string) => void;
  onRequestLogout: () => void;
  onNotice: (message: string) => void;
}) {
  const isAdmin = user.role === "admin";
  const [prefs, setPrefs] = usePersonalValue<StaffPreferences>(staffPreferencesKey(user.email), DEFAULT_STAFF_PREFERENCES);
  const [resetOpen, setResetOpen] = useState(false);
  const enabled = categories.filter((category) => !prefs.mutedCategories.includes(category.key)).length;

  function toggle(key: NotificationCategory, on: boolean) {
    setPrefs((current) => ({ ...current, mutedCategories: on ? current.mutedCategories.filter((item) => item !== key) : [...new Set([...current.mutedCategories, key])] }));
    onNotice(on ? "Notifications turned on." : "Notifications turned off.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="subheading">Choose what shows up in your notifications. Changes save instantly.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Profile")}><Icon name="user" size={15} /> Profile</button>
        {isAdmin && <button type="button" className="secondary-button" onClick={() => onNavigate("School settings")}><Icon name="sliders" size={15} /> School rules</button>}
      </div>
    </section>

    <div className="student-settings-layout">
      <div className="student-settings-main">
        <section className="panel student-panel student-settings-card">
          <div className="panel-header"><div><h2>Notifications</h2><p>{enabled} of {categories.length} types on · shown in the bell at the top right</p></div><span className="setting-count">{enabled} on</span></div>
          <div className="student-settings-list">
            {categories.map((category) => <Toggle key={category.key} checked={!prefs.mutedCategories.includes(category.key)} onChange={(on) => toggle(category.key, on)} title={category.title} description={category.description} />)}
          </div>
        </section>

        <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">ACCOUNT ACCESS</span><h2>Sign out</h2><p>You can sign back in at any time.</p></div>
          <button type="button" className="danger-outline-button" onClick={onRequestLogout}><Icon name="logout" size={15} /> Sign out</button>
        </section>

        {isAdmin && <section className="panel student-panel danger-zone">
          <div><span className="eyebrow">DEMO DATA</span><h2>Reset the demo school</h2><p>Restore every account&apos;s lessons, people, courses, and credits to the original demo. Personal preferences are kept.</p></div>
          {resetOpen
            ? <div className="inline-confirm"><span>Reset the demo school for every account?</span><button type="button" className="cancel-button" onClick={() => setResetOpen(false)}>Keep data</button><button type="button" className="danger-button" onClick={() => { resetSchool(); setResetOpen(false); onNotice("The demo school was reset."); }}>Reset now</button></div>
            : <button type="button" className="danger-outline-button" onClick={() => setResetOpen(true)}><Icon name="repeat" size={15} /> Reset demo</button>}
        </section>}
      </div>

      <aside className="student-settings-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Where things live</h2><p>Quick links</p></div></div>
          <div className="manager-scope-list">
            <button type="button" onClick={() => onNavigate("Approvals")}><Icon name="check" size={16} /><span>Approvals</span><Icon name="arrow" size={14} /></button>
            <button type="button" onClick={() => onNavigate("Performance")}><Icon name="chart" size={16} /><span>Performance</span><Icon name="arrow" size={14} /></button>
            {isAdmin && <button type="button" onClick={() => onNavigate("School settings")}><Icon name="sliders" size={16} /><span>School rules &amp; activity log</span><Icon name="arrow" size={14} /></button>}
          </div>
        </section>
      </aside>
    </div>
  </div>;
}
