"use client";

import TeacherAnalytics from "./TeacherAnalytics";
import TeacherBookingSlots from "./TeacherBookingSlots";
import TeacherLessons from "./TeacherLessons";
import TeacherOverview from "./TeacherOverview";
import TeacherProfilePage from "./TeacherProfile";
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

  if (activeNav === "Booking slots") return <TeacherBookingSlots
    lessons={state.lessons}
    closedSlots={state.closedSlots}
    openedSlots={state.openedSlots}
    onRequestSlotClosure={workspace.requestSlotClosure}
    onCancelSlotClosureRequest={workspace.cancelSlotClosureRequest}
    onOpenSlot={workspace.openSlot}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Lessons") return <TeacherLessons
    lessons={state.lessons}
    students={state.students}
    closedSlots={state.closedSlots}
    openedSlots={state.openedSlots}
    onAddLesson={workspace.addLesson}
    onRequestLessonCancellation={workspace.requestLessonCancellation}
    onWithdrawLessonCancellationRequest={workspace.withdrawLessonCancellationRequest}
    onCompleteLesson={workspace.completeLesson}
    onNavigate={onNavigate}
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

  if (activeNav === "Analytics") return <TeacherAnalytics
    lessons={state.lessons}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;

  if (activeNav === "Profile") return <TeacherProfilePage
    key={JSON.stringify(state.profile)}
    account={account}
    profile={state.profile}
    students={state.students}
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
    closedSlots={state.closedSlots}
    openedSlots={state.openedSlots}
    onToggleTask={workspace.toggleTask}
    onNavigate={onNavigate}
    onNotice={onNotice}
  />;
}
