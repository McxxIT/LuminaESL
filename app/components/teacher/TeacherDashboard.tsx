"use client";

import TeacherAnalytics from "./TeacherAnalytics";
import TeacherCurriculum from "./TeacherCurriculum";
import TeacherOverview from "./TeacherOverview";
import TeacherProfilePage from "./TeacherProfile";
import TeacherSchedule from "./TeacherSchedule";
import TeacherSettingsPage from "./TeacherSettings";
import TeacherStudents from "./TeacherStudents";
import useTeacherWorkspace from "./useTeacherWorkspace";
import type { Account } from "../../lib/types";

type TeacherDashboardProps = {
  account: Account;
  activeNav: string;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
  onUpdateAccount: (account: Account) => void;
  onRequestLogout: () => void;
};

export default function TeacherDashboard({ account, activeNav, onNavigate, onNotice, onUpdateAccount, onRequestLogout }: TeacherDashboardProps) {
  const workspace = useTeacherWorkspace(account);
  const { state } = workspace;

  if (activeNav === "Schedule") return <TeacherSchedule
    settings={state.settings}
    lessons={state.lessons}
    students={state.students}
    availability={state.availability}
    onAddLesson={workspace.addLesson}
    onRescheduleLesson={workspace.rescheduleLesson}
    onCancelLesson={workspace.cancelLesson}
    onStartLesson={workspace.startLesson}
    onCompleteLesson={workspace.completeLesson}
    onToggleAvailability={workspace.toggleAvailability}
    onSetAvailabilityActive={workspace.setAvailabilityActive}
    onNotice={onNotice}
  />;

  if (activeNav === "Students") return <TeacherStudents
    students={state.students}
    lessons={state.lessons}
    onAddNote={workspace.addStudentNote}
    onAssignHomework={workspace.assignHomework}
    onReviewHomework={workspace.reviewHomework}
    onNotice={onNotice}
  />;

  if (activeNav === "Curriculum") return <TeacherCurriculum
    units={state.curriculum}
    onCreateUnit={workspace.createUnit}
    onUpdateUnit={workspace.updateUnit}
    onTogglePublish={workspace.toggleUnitPublish}
    onMoveUnit={workspace.moveUnit}
    onNotice={onNotice}
  />;

  if (activeNav === "Analytics") return <TeacherAnalytics
    students={state.students}
    lessons={state.lessons}
    curriculum={state.curriculum}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Profile") return <TeacherProfilePage
    key={JSON.stringify(state.profile)}
    account={account}
    profile={state.profile}
    students={state.students}
    availability={state.availability}
    onSaveProfile={workspace.updateProfile}
    onUpdateAccount={onUpdateAccount}
    onNavigate={onNavigate}
    onRequestLogout={onRequestLogout}
    onNotice={onNotice}
  />;

  if (activeNav === "Settings") return <TeacherSettingsPage
    key={JSON.stringify(state.settings)}
    profile={state.profile}
    settings={state.settings}
    availability={state.availability}
    onSaveSettings={workspace.updateSettings}
    onResetWorkspace={workspace.resetWorkspace}
    onNavigate={onNavigate}
    onRequestLogout={onRequestLogout}
    onNotice={onNotice}
  />;

  return <TeacherOverview
    profile={state.profile}
    lessons={state.lessons}
    students={state.students}
    tasks={state.tasks}
    availability={state.availability}
    curriculum={state.curriculum}
    onToggleTask={workspace.toggleTask}
    onSetAvailabilityActive={workspace.setAvailabilityActive}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;
}
