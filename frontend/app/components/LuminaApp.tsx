"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import LoginScreen from "./LoginScreen";
import ManagerWorkspace from "./manager/ManagerWorkspace";
import TeacherDashboard from "./teacher/TeacherDashboard";
import StudentDashboard from "./student/StudentDashboard";
import NotificationPanel, { type AppNotification } from "./NotificationPanel";
import { useNotifications } from "../lib/hooks/useNotifications";
import { useAuth } from "../lib/hooks/useAuth";
import { accountForUser, restoreSession, signOut } from "../lib/auth/session";
import { isApiDataMode, isDemoMode } from "../lib/auth/mode";
import { loadSchoolFromApi, refreshSchoolFromApi } from "../lib/school/api/bootstrap";
import { captureLocalSnapshot } from "../lib/school/import/capture";
import { clearSchoolSnapshot } from "../lib/school/store";
import { adminNavItems, managerNavItems, studentNavItems, teacherNavItems } from "../lib/data";
import { friendlyRole, initials } from "../lib/student";
import type { Account } from "../lib/types";

type ModalName = "help" | "logout" | null;
type SchoolStatus = "idle" | "loading" | "ready" | "error";

export default function LuminaApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState(() => !isDemoMode());
  const [schoolStatus, setSchoolStatus] = useState<SchoolStatus>("idle");
  const [schoolFor, setSchoolFor] = useState<string | null>(null);
  const [schoolAttempt, setSchoolAttempt] = useState(0);
  const [schoolStale, setSchoolStale] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [studentCredits, setStudentCredits] = useState(24);
  const [openPopover, setOpenPopover] = useState<"notifications" | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const { user: authUser } = useAuth();
  const apiData = isApiDataMode();
  const authEmail = authUser?.email ?? null;
  const effectiveAccount = isDemoMode() ? account : authUser ? accountForUser(authUser) : null;
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(effectiveAccount);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      const stored = window.localStorage.getItem("lumina-account");
      const restore = window.setTimeout(() => {
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored) as Account;
          if (parsed.email && parsed.role && parsed.name) {
            setAccount(parsed);
          }
        } catch {
          window.localStorage.removeItem("lumina-account");
        }
      }, 0);
      return () => window.clearTimeout(restore);
    }

    let cancelled = false;
    restoreSession()
      .then(() => {
        if (!cancelled) window.localStorage.removeItem("lumina-account");
      })
      .catch(() => {
        if (!cancelled) window.localStorage.removeItem("lumina-account");
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // API mode: fill the store from the role-scoped bootstrap once a session exists.
  useEffect(() => {
    if (!apiData || !authEmail) return;
    // Must run before `loadSchoolFromApi`: hydrating the bootstrap used to overwrite the
    // local school, which is the data the one-time import needs.
    captureLocalSnapshot();
    let cancelled = false;
    loadSchoolFromApi(authEmail)
      .then(({ source }) => {
        if (cancelled) return;
        setSchoolStale(source === "cache");
        setSchoolFor(authEmail);
        setSchoolStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Lumina: school bootstrap failed.", error);
        setSchoolFor(null);
        setSchoolStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apiData, authEmail, schoolAttempt]);

  // API mode has no storage events, so re-read on focus/visibility instead.
  useEffect(() => {
    if (!apiData || !authEmail || schoolStatus !== "ready" || schoolFor !== authEmail) return;
    let lastRefresh = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh < 15_000) return;
      lastRefresh = now;
      void refreshSchoolFromApi(authEmail)
        .then(() => setSchoolStale(false))
        .catch((error) => console.warn("Lumina: school refresh failed.", error));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [apiData, authEmail, schoolFor, schoolStatus]);

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
    setStudentCredits(24);
    setOpenPopover(null);
    setModal(null);
    // `lumina-account` is the demo session blob; API mode gets its session from the JWT cookie.
    if (isDemoMode()) window.localStorage.setItem("lumina-account", JSON.stringify(nextAccount));
  }

  function updateAccount(nextAccount: Account) {
    setAccount(nextAccount);
    if (isDemoMode()) window.localStorage.setItem("lumina-account", JSON.stringify(nextAccount));
  }

  function logout() {
    const finish = () => {
      setAccount(null);
      setActiveNav("Overview");
      setStudentCredits(24);
      window.localStorage.removeItem("lumina-account");
      setOpenPopover(null);
      setModal(null);
      if (apiData) {
        clearSchoolSnapshot();
        setSchoolStatus("idle");
        setSchoolFor(null);
        setSchoolStale(false);
      }
    };
    if (isDemoMode()) {
      finish();
      return;
    }
    void signOut().finally(finish);
  }

  function navigate(page: string) {
    setActiveNav(page);
    setOpenPopover(null);
    setModal(null);
  }

  function openNotification(notification: AppNotification) {
    markRead(notification.id);
    navigate(notification.nav);
  }

  function openProfile() {
    navigate("Profile");
  }

  function openSettings() {
    navigate("Settings");
  }

  if (booting) return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark">L</div><strong>Lumina <span>ESL</span></strong></div>
    <div className="auth-heading"><p className="eyebrow">WELCOME BACK</p><h1>Restoring your session</h1><p>Checking your Lumina account.</p></div>
  </section></main>;

  if (!effectiveAccount) return <LoginScreen onLogin={login} />;

  const schoolReady = schoolStatus === "ready" && schoolFor === authEmail;
  if (apiData && !schoolReady) {
    if (schoolStatus === "error") return <main className="auth-shell"><section className="auth-card">
      <div className="auth-brand"><div className="brand-mark">L</div><strong>Lumina <span>ESL</span></strong></div>
      <div className="auth-heading"><p className="eyebrow">CONNECTION LOST</p><h1>Could not load your school</h1><p>The Lumina API did not return your school data. Check that the backend is running, then try again.</p></div>
      <div className="auth-form"><button type="button" className="primary-button" onClick={() => { setSchoolStatus("loading"); setSchoolAttempt((attempt) => attempt + 1); }}>Try again</button><button type="button" className="cancel-button" onClick={logout}>Log out</button></div>
    </section></main>;
    return <main className="auth-shell"><section className="auth-card">
      <div className="auth-brand"><div className="brand-mark">L</div><strong>Lumina <span>ESL</span></strong></div>
      <div className="auth-heading"><p className="eyebrow">LOADING</p><h1>Loading your school</h1><p>Fetching your courses, lessons, and team from the Lumina API.</p></div>
    </section></main>;
  }

  const roleNavItems = { student: studentNavItems, teacher: teacherNavItems, manager: managerNavItems, admin: adminNavItems }[effectiveAccount.role];
  const roleLabel = friendlyRole(effectiveAccount.role);
  const accountInitials = initials(effectiveAccount.name);

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
          <div><strong>{effectiveAccount.name}</strong><small>{roleLabel}</small></div>
          <span className="profile-card-more"><Icon name="user" size={16} /></span>
        </button>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeNav}</strong></div>
        <div className="topbar-actions">
          {effectiveAccount.role === "student" && <button type="button" className="student-credit-chip" onClick={() => navigate("Billing")}><span>LESSON CREDITS</span><strong>{studentCredits.toFixed(1)} hrs</strong></button>}
          <div className="popover-anchor">
            <button type="button" className="icon-button notification-button" aria-label="Notifications" onClick={() => setOpenPopover(openPopover === "notifications" ? null : "notifications")}><Icon name="bell" /><span className={`notification-dot ${unreadCount > 0 ? "" : "hidden-dot"}`} /></button>
            {openPopover === "notifications" && <NotificationPanel notifications={notifications} onOpen={openNotification} onMarkAllRead={markAllRead} onClose={() => setOpenPopover(null)} />}
          </div>
        </div>
      </header>
      <div className="content-wrap">
        {effectiveAccount.role === "admin" || effectiveAccount.role === "manager"
          ? <ManagerWorkspace account={effectiveAccount} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} onUpdateAccount={updateAccount} onRequestLogout={() => setModal("logout")} />
          : effectiveAccount.role === "teacher"
            ? <TeacherDashboard account={effectiveAccount} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} onUpdateAccount={updateAccount} onRequestLogout={() => setModal("logout")} />
            : <StudentDashboard account={effectiveAccount} activeNav={activeNav} onNavigate={navigate} onNotice={showNotice} onUpdateAccount={updateAccount} onCreditChange={setStudentCredits} onRequestLogout={() => setModal("logout")} />}
      </div>
    </main>

    {notice && <div className="toast" role="status">{notice}</div>}
    {!notice && schoolStale && <div className="toast" role="status">API unreachable — showing saved school data.</div>}

    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
      <section className="general-modal" role="dialog" aria-modal="true">
        {modal === "help" && <><div className="modal-header"><div><p className="eyebrow">SUPPORT</p><h2>Help center</h2><p>Find a quick answer or contact the Lumina team.</p></div><button type="button" className="icon-button bordered" aria-label="Close help dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><div className="help-options"><button type="button" onClick={() => { setModal(null); showNotice("Getting started guide opened."); }}>Getting started <Icon name="arrow" size={14} /></button><button type="button" onClick={() => { setModal(null); showNotice("Support request form opened."); }}>Contact support <Icon name="arrow" size={14} /></button><button type="button" onClick={() => { setModal(null); navigate("Settings"); }}>Preferences <Icon name="arrow" size={14} /></button></div></>}
        {modal === "logout" && <><div className="modal-header"><div><p className="eyebrow">SIGN OUT</p><h2>Log out of Lumina?</h2><p>You can sign back in at any time with your account.</p></div><button type="button" className="icon-button bordered" aria-label="Close logout dialog" onClick={() => setModal(null)}><Icon name="x" /></button></div><div className="modal-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>Stay signed in</button><button type="button" className="danger-button" onClick={logout}>Log out</button></div></>}
      </section>
    </div>}
  </div>;
}
