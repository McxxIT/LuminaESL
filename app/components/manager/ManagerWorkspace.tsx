"use client";

import AdminManagers from "../admin/AdminManagers";
import AdminSettings from "../admin/AdminSettings";
import Icon from "../Icon";
import ManagerApprovals from "./ManagerApprovals";
import ManagerCurriculum from "./ManagerCurriculum";
import ManagerOverview from "./ManagerOverview";
import ManagerPerformance from "./ManagerPerformance";
import ManagerSchedule from "./ManagerSchedule";
import ManagerStudents from "./ManagerStudents";
import ManagerTeachers from "./ManagerTeachers";
import { useApprovals } from "./useApprovals";
import { useCurrentUser } from "../../lib/hooks/useCurrentUser";
import { useSchoolReady } from "../../lib/hooks/useSchool";
import type { Account } from "../../lib/types";

type ManagerWorkspaceProps = {
  account: Account;
  activeNav: string;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

/**
 * Page router for the admin and manager roles. Both use the same pages; selectors scope the data
 * (a manager sees their own team, the admin sees the whole school). Admin-only pages are guarded.
 */
export default function ManagerWorkspace({ account, activeNav, onNavigate, onNotice }: ManagerWorkspaceProps) {
  const ready = useSchoolReady();
  const user = useCurrentUser(account);
  const approvals = useApprovals(user);

  if (!ready) return <div className="role-workspace"><div className="student-empty-inline"><Icon name="clock" /><p>Loading school data…</p></div></div>;
  if (!user) {
    return <div className="role-workspace"><section className="panel student-panel"><div className="student-empty-state">
      <div className="student-empty-icon"><Icon name="user" size={22} /></div>
      <h3>Account not found in the school</h3>
      <p>{account.email} has no matching school record. Reset the demo data or sign in with another account.</p>
    </div></section></div>;
  }

  const isAdmin = user.role === "admin";

  if (activeNav === "Managers" && isAdmin) return <AdminManagers user={user} onNavigate={onNavigate} onNotice={onNotice} />;
  if (activeNav === "Teachers") return <ManagerTeachers user={user} onNotice={onNotice} />;
  if (activeNav === "Students") return <ManagerStudents user={user} onNotice={onNotice} />;
  if (activeNav === "Approvals") return <ManagerApprovals user={user} approvals={approvals} onNotice={onNotice} />;

  if (activeNav === "Curriculum") return <ManagerCurriculum user={user} onNotice={onNotice} />;
  if (activeNav === "Schedule") return <ManagerSchedule user={user} onNotice={onNotice} />;
  if (activeNav === "Performance") return <ManagerPerformance user={user} />;
  if (activeNav === "School settings" && isAdmin) return <AdminSettings user={user} onNotice={onNotice} />;

  return <ManagerOverview user={user} pendingApprovals={approvals.pendingCount} onNavigate={onNavigate} />;
}
