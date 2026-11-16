"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import LoginScreen from "./LoginScreen";
import ManagerWorkspace from "./manager/ManagerWorkspace";
import TeacherDashboard from "./teacher/TeacherDashboard";
import StudentDashboard from "./student/StudentDashboard";
import NotificationPanel, { AppNotification } from "./NotificationPanel";
import { adminNavItems, managerNavItems, studentNavItems, teacherNavItems } from "../lib/data";
import { friendlyRole, initials } from "../lib/student";
import type { Account } from "../lib/types";

type ModalName = "profile" | "settings" | "help" | "logout" | null;

export default function LuminaApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [studentCredits, setStudentCredits] = useState(24.5);
  const [openPopover, setOpenPopover] = useState<"notifications" | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [editName, setEditName] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([
    { id: 1, title: "Lesson reminder", detail: "Conversation practice starts at 09:00.", unread: true },
    { id: 2, title: "New feedback", detail: "Jamie left feedback on your latest lesson.", unread: true },
    { id: 3, title: "Assignment due", detail: "Your elevator pitch recording is due today.", unread: true },
    { id: 4, title: "Schedule updated", detail: "Your weekly calendar is ready to review.", unread: false },
  ]);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("lumina-account");
    const restore = window.setTimeout(() => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as Account;
        if (parsed.email && parsed.role && parsed.name) {
          setAccount(parsed);
          setEditName(parsed.name);
        }
      } catch {
        window.localStorage.removeItem("lumina-account");
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openPopover) setOpenPopover(null);
      else if (modal) setModal(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPopover, modal]);

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  function showNotice(message: string) {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2800);
  }

  function login(nextAccount: Account) {
    setAccount(nextAccount);
    setActiveNav("Overview");
    setStudentCredits(24.5);
    setEditName(nextAccount.name);
    setOpenPopover(null);
    setModal(null);
    window.localStorage.setItem("lumina-account", JSON.stringify(nextAccount));
  }

  function updateAccount(nextAccount: Account) {
    setAccount(nextAccount);
    setEditName(nextAccount.name);
    window.localStorage.setItem("lumina-account", JSON.stringify(nextAccount));
  }

  function logout() {
    setAccount(null);
    setActiveNav("Overview");
    setStudentCredits(24.5);
    window.localStorage.removeItem("lumina-account");
    setOpenPopover(null);
    setModal(null);
  }

  function navigate(page: string) {
    setActiveNav(page);
    setOpenPopover(null);
    setModal(null);
  }

  function readNotification(id: number) {
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
  }

  function openProfile() {
    if (account?.role === "student" || account?.role === "teacher") navigate("Profile");
    else {
      setEditName(account?.name ?? "");
      setOpenPopover(null);
      setModal("profile");
    }
  }

  function openSettings() {
    if (account?.role === "student" || account?.role === "teacher") navigate("Settings");
    else {
      setOpenPopover(null);
      setModal("settings");
    }
  }

  function saveProfile() {
    if (!account || !editName.trim()) return;
    const updated = { ...account, name: editName.trim() };
    updateAccount(updated);
    setModal(null);
    showNotice("Profile updated.");
  }

  if (!account) return <LoginScreen onLogin={login} />;

  const roleNavItems = { student: studentNavItems, teacher: teacherNavItems, manager: managerNavItems, admin: adminNavItems }[account.role];
  const roleLabel = friendlyRole(account.role);
  const accountInitials = initials(account.name);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">L</div><span>Lumina</span><span className="brand-badge">ESL</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Primary navigation">
        {roleNavItems.map((item) => <button type="button" className={`nav-item ${activeNav === item.label ? "active" : ""}`} onClick={() => navigate(item.label)} key={item.label}><Icon name={item.icon} /><span>{item.label}</span></button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom">
        <button type="button" className="nav-item" onClick={() => setModal("help")}><Icon name="help" /><span>Help center</span></button>
        <button type="button" className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={openSettings} aria-current={activeNav === "Settings" ? "page" : undefined}><Icon name="settings" /><span>Settings</span></button>
        <button type="button" className="nav-item logout-nav" onClick={() => setModal("logout")}><Icon name="logout" /><span>Log out</span></button>
        <button type="button" className={`profile-card profile-card-button ${activeNav === "Profile" ? "active" : ""}`} onClick={openProfile} aria-label="Open profile" aria-current={activeNav === "Profile" ? "page" : undefined}>
          <div className="avatar avatar-indigo">{accountInitials}</div>
          <div><strong>{account.name}</strong><small>{roleLabel}</small></div>
          <span className="profile-card-more"><Icon name="user" size={16} /></span>
        </button>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeNav}</strong></div>
        <div className="topbar-actions">
          {account.role === "student" && <button type="button" className="student-credit-chip" onClick={() => navigate("Billing")}><span>LESSON CREDITS</span><strong>{studentCredits.toFixed(1)} hrs</strong></button>}
          <div className="popover-anchor">
            <button type="button" className="icon-button notification-button" aria-label="Notifications" onClick={() => setOpenPopover(openPopover === "notifications" ? null : "notifications")}><Icon name="bell" /><span className={`notification-dot ${notifications.some((item) => item.unread) ? "" : "hidden-dot"}`} /></button>
            {openPopover === "notifications" && <NotificationPanel notifications={notifications} onRead={readNotification} onClose={() => setOpenPopover(null)} />}
          </div>
        </div>
      </header>
      <div className="content-wrap">
        {account.role === "admin" || account.role === "manager"
          ? <ManagerWorkspace account={account} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} />
          : account.role === "teacher"
            ? <TeacherDashboard account={account} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} onUpdateAccount={updateAccount} onRequestLogout={() => setModal("logout")} />
            : <StudentDashboard account={account} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} onUpdateAccount={updateAccount} onCreditChange={setStudentCredits} onRequestLogout={() => setModal("logout")} />}
      </div>
    </main>

    {notice && <div className="toast" role="status">{notice}</div>}

    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
      <section className="general-modal" role="dialog" aria-modal="true">
        {modal === "profile" && <><div className="modal-header"><div><p className="eyebrow">ACCOUNT PROFILE</p><h2>Edit profile</h2><p>Keep your account details up to date.</p></div><button type="button" className="icon-button bordered" aria-label="Close profile dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><label className="modal-field">Display name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label className="modal-field">Email address<input value={account.email} disabled /></label><div className="modal-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>Cancel</button><button type="button" className="primary-button" onClick={saveProfile}>Save changes</button></div></>}
        {modal === "settings" && <><div className="modal-header"><div><p className="eyebrow">PREFERENCES</p><h2>Settings</h2><p>Customize how Lumina works for you.</p></div><button type="button" className="icon-button bordered" aria-label="Close settings dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><div className="settings-list"><label><span><strong>Email notifications</strong><small>Receive reminders about lessons and feedback.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Weekly progress summary</strong><small>Get a summary every Monday morning.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Compact schedule</strong><small>Show more lessons in calendar views.</small></span><input type="checkbox" /></label></div><div className="modal-footer"><button type="button" className="primary-button" onClick={() => { setModal(null); showNotice("Settings saved."); }}>Save settings</button></div></>}
        {modal === "help" && <><div className="modal-header"><div><p className="eyebrow">SUPPORT</p><h2>Help center</h2><p>Find a quick answer or contact the Lumina team.</p></div><button type="button" className="icon-button bordered" aria-label="Close help dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><div className="help-options"><button type="button" onClick={() => { setModal(null); showNotice("Getting started guide opened."); }}>Getting started <Icon name="arrow" size={14} /></button><button type="button" onClick={() => { setModal(null); showNotice("Support request form opened."); }}>Contact support <Icon name="arrow" size={14} /></button><button type="button" onClick={() => { setModal(null); navigate("Settings"); }}>Preferences <Icon name="arrow" size={14} /></button></div></>}
        {modal === "logout" && <><div className="modal-header"><div><p className="eyebrow">SIGN OUT</p><h2>Log out of Lumina?</h2><p>You can sign back in at any time with your account.</p></div><button type="button" className="icon-button bordered" aria-label="Close logout dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><div className="modal-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>Stay signed in</button><button type="button" className="danger-button" onClick={logout}>Log out</button></div></>}
      </section>
    </div>}
  </div>;
}
