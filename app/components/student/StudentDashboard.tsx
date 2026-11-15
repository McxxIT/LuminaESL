"use client";

import { useEffect } from "react";
import StudentAssignments from "./StudentAssignments";
import StudentBilling from "./StudentBilling";
import StudentLessons from "./StudentLessons";
import StudentOverview from "./StudentOverview";
import StudentPractice from "./StudentPractice";
import StudentProfile from "./StudentProfile";
import StudentProgress from "./StudentProgress";
import StudentSettings from "./StudentSettings";
import useStudentWorkspace from "./useStudentWorkspace";
import { studentAchievements, studentPracticeActivities, studentSkills } from "../../lib/data";
import type { Account } from "../../lib/types";

type StudentDashboardProps = {
  account: Account;
  activeNav: string;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
  onUpdateAccount: (account: Account) => void;
  onCreditChange: (hours: number) => void;
  onRequestLogout: () => void;
};

export default function StudentDashboard({ account, activeNav, onNavigate, onNotice, onUpdateAccount, onCreditChange, onRequestLogout }: StudentDashboardProps) {
  const workspace = useStudentWorkspace(account);
  const { state } = workspace;

  useEffect(() => {
    onCreditChange(state.creditHours);
  }, [state.creditHours, onCreditChange]);

  if (activeNav === "Lessons") return <StudentLessons
    lessons={state.lessons}
    creditHours={state.creditHours}
    onBookLesson={workspace.bookLesson}
    onRescheduleLesson={workspace.rescheduleLesson}
    onCancelLesson={workspace.cancelLesson}
    onRebookLesson={workspace.rebookLesson}
    onNotice={onNotice}
  />;

  if (activeNav === "Practice") return <StudentPractice
    activities={studentPracticeActivities}
    practiceResults={state.practiceResults}
    onCompletePractice={workspace.completePractice}
    onNotice={onNotice}
  />;

  if (activeNav === "Assignments") return <StudentAssignments
    assignments={state.assignments}
    onSubmitAssignment={workspace.submitAssignment}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Progress") return <StudentProgress
    profile={state.profile}
    skills={studentSkills}
    achievements={studentAchievements}
    lessons={state.lessons}
    practiceResults={state.practiceResults}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Billing") return <StudentBilling
    creditHours={state.creditHours}
    transactions={state.transactions}
    onPurchase={workspace.purchaseCredits}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Profile") return <StudentProfile
    key={JSON.stringify(state.profile)}
    account={account}
    profile={state.profile}
    onSaveProfile={workspace.updateProfile}
    onUpdateAccount={onUpdateAccount}
    onNavigate={onNavigate}
    onRequestLogout={onRequestLogout}
    onNotice={onNotice}
  />;

  if (activeNav === "Settings") return <StudentSettings
    key={JSON.stringify(state.settings)}
    profile={state.profile}
    settings={state.settings}
    onSaveSettings={workspace.updateSettings}
    onResetWorkspace={workspace.resetWorkspace}
    onNavigate={onNavigate}
    onRequestLogout={onRequestLogout}
    onNotice={onNotice}
  />;

  return <StudentOverview
    profile={state.profile}
    lessons={state.lessons}
    creditHours={state.creditHours}
    assignments={state.assignments}
    skills={studentSkills}
    completedTasks={state.completedTasks}
    practiceResults={state.practiceResults}
    onToggleTask={workspace.toggleTask}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;
}
