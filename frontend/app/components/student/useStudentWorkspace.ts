"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultStudentProfile, defaultStudentSettings, studentAssignments } from "../../lib/data";
import { useCurrentUser } from "../../lib/hooks/useCurrentUser";
import { useSchool } from "../../lib/hooks/useSchool";
import { isApiDataMode } from "../../lib/auth/mode";
import {
  activeCourseProgress,
  assignmentsForStudent,
  toStudentAssignmentView,
  creditBalance,
  creditTransactionsView,
  enrollmentsForStudent,
  getSchoolSnapshot,
  findUserByEmail,
  resetSchool,
  studentLessonsView,
  studentProfile as studentProfileRecord,
  teacherProfile,
  teacherScheduleView,
  toStudentLessonView,
  usersByRole,
  type Lesson,
  type SchoolData,
} from "../../lib/school";
import {
  bookLesson as bookLessonService,
  cancelLessonByStudent,
  purchaseCredits as purchaseCreditsService,
  rateLesson as rateLessonService,
  submitHomework,
  updateMyName,
  type RateLessonInput,
  rebookLesson as rebookLessonService,
  rescheduleLesson as rescheduleLessonService,
  type ServiceResult,
  type ServiceCall,
} from "../../lib/school/services";
import { initials } from "../../lib/student";
import type {
  Account,
  PracticeResult,
  StudentAssignment,
  StudentLesson,
  StudentProfile,
  StudentSettings,
  StudentWorkspaceState,
} from "../../lib/types";

const STORAGE_PREFIX = "lumina-student-workspace:";

export type BookLessonInput = {
  teacherId: string;
  date: string;
  time: string;
  title: string;
  focus: string[];
  notes: string;
};

/** A teacher the student can book with. */
export type BookableTutor = {
  id: string;
  name: string;
  initials: string;
  color: string;
  specialty: string;
};

/** Personal data only. Lessons and credits live in the shared school store. */
type StudentPersonalState = {
  profile: StudentProfile;
  settings: StudentSettings;
  assignments: StudentAssignment[];
  completedTasks: string[];
  practiceResults: PracticeResult[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEMO_STUDENT_EMAIL = "student@lumina.school";

/** The demo student starts with demo content; anyone else starts from their school record. */
function createPersonalState(account: Account): StudentPersonalState {
  const defaults = defaultStudentProfile(account);
  if (account.email.toLowerCase() === DEMO_STUDENT_EMAIL) {
    return { profile: defaults, settings: clone(defaultStudentSettings), assignments: clone(studentAssignments), completedTasks: [], practiceResults: [] };
  }
  const data = getSchoolSnapshot();
  const user = findUserByEmail(data, account.email);
  const record = user ? studentProfileRecord(data, user.id) : undefined;
  return {
    profile: {
      ...defaults,
      phone: "",
      country: "",
      nativeLanguage: "",
      bio: "",
      currentLevel: record?.level ?? defaults.currentLevel,
      targetLevel: record?.targetLevel ?? defaults.targetLevel,
      learningGoal: record?.goal ?? "",
      memberSince: new Date(user?.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    },
    settings: clone(defaultStudentSettings),
    assignments: [],
    completedTasks: [],
    practiceResults: [],
  };
}

const notSignedIn: ServiceResult<never> = { ok: false, error: "Your account was not found in the school." };

/** Service results carry the shared lesson; student screens want their own view of it. */
async function toLessonResult(result: ServiceCall<Lesson>): Promise<ServiceResult<StudentLesson>> {
  const resolved = await result;
  return resolved.ok ? { ok: true, value: toStudentLessonView(getSchoolSnapshot(), resolved.value) } : resolved;
}

/** Teachers the student is enrolled with; every active teacher if they have no enrollment yet. */
function bookableTutors(data: SchoolData, studentId: string | undefined): BookableTutor[] {
  const enrolled = studentId ? enrollmentsForStudent(data, studentId).filter((item) => item.status === "active").map((item) => item.teacherId) : [];
  const teachers = usersByRole(data, "teacher").filter((teacher) => teacher.status === "active" && (enrolled.length === 0 || enrolled.includes(teacher.id)));
  return teachers.map((teacher) => ({ id: teacher.id, name: teacher.name, initials: initials(teacher.name), color: teacher.avatarColor, specialty: teacherProfile(data, teacher.id)?.headline ?? "Teacher" }));
}

export default function useStudentWorkspace(account: Account) {
  const storageKey = `${STORAGE_PREFIX}${account.email.toLowerCase()}`;
  const [personal, setPersonal] = useState<StudentPersonalState>(() => createPersonalState(account));
  const [hydrated, setHydrated] = useState(false);
  const student = useCurrentUser(account);
  const studentId = student?.id;

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const base = createPersonalState(account);
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<StudentPersonalState>;
          setPersonal({
            profile: { ...base.profile, ...parsed.profile, email: account.email },
            settings: { ...base.settings, ...parsed.settings, defaultDuration: "25" },
            assignments: parsed.assignments?.length ? parsed.assignments : base.assignments,
            completedTasks: parsed.completedTasks ?? [],
            practiceResults: parsed.practiceResults ?? [],
          });
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [account, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    // Only personal fields are saved here; old shared fields are dropped after migration.
    window.localStorage.setItem(storageKey, JSON.stringify(personal));
  }, [hydrated, personal, storageKey]);

  const selectShared = useCallback((data: SchoolData) => ({
    lessons: studentId ? studentLessonsView(data, studentId) : [],
    assignments: studentId ? assignmentsForStudent(data, studentId).map((assignment) => toStudentAssignmentView(data, assignment)) : [],
    creditHours: studentId ? creditBalance(data, studentId) : 0,
    transactions: studentId ? creditTransactionsView(data, studentId) : [],
    tutors: bookableTutors(data, studentId),
    course: (() => {
      const progress = studentId ? activeCourseProgress(data, studentId) : undefined;
      return progress ? { courseTitle: progress.courseTitle, completed: progress.completed, total: progress.total, nextPlanTitle: progress.nextPlan?.title } : undefined;
    })(),
  }), [studentId]);
  const shared = useSchool(selectShared);

  const state: StudentWorkspaceState = useMemo(() => ({
    ...personal,
    assignments: shared.assignments,
    lessons: shared.lessons,
    creditHours: shared.creditHours,
    transactions: shared.transactions,
  }), [personal, shared]);

  /** A teacher's live slot rules and bookings (all students), for showing open slots. */
  const getTutorSchedule = useCallback((teacherId: string) => teacherScheduleView(getSchoolSnapshot(), teacherId), []);

  const updateProfile = useCallback((profile: StudentProfile) => {
    setPersonal((current) => ({ ...current, profile }));
    // The name is shared: teachers and managers see it.
    if (studentId) updateMyName(studentId, profile.name);
  }, [studentId]);

  const updateSettings = useCallback((settings: StudentSettings) => {
    setPersonal((current) => ({ ...current, settings }));
  }, []);

  const bookLesson = useCallback((input: BookLessonInput) => studentId ? toLessonResult(bookLessonService(studentId, input)) : Promise.resolve(notSignedIn), [studentId]);

  const rescheduleLesson = useCallback((id: string, date: string, time: string) => studentId ? toLessonResult(rescheduleLessonService(studentId, id, date, time)) : Promise.resolve(notSignedIn), [studentId]);

  const cancelLesson = useCallback((id: string, reason: string) => studentId ? cancelLessonByStudent(studentId, id, reason) : Promise.resolve(notSignedIn), [studentId]);

  const rebookLesson = useCallback((id: string, date: string, time: string) => studentId ? toLessonResult(rebookLessonService(studentId, id, date, time)) : Promise.resolve(notSignedIn), [studentId]);

  const toggleTask = useCallback((task: string) => {
    setPersonal((current) => ({
      ...current,
      completedTasks: current.completedTasks.includes(task) ? current.completedTasks.filter((item) => item !== task) : [...current.completedTasks, task],
    }));
  }, []);

  /** Shared homework: the teacher sees the submission on their roster. */
  const submitAssignment = useCallback((id: string, response: string) => studentId ? submitHomework(studentId, id, response) : notSignedIn, [studentId]);

  const completePractice = useCallback((activityId: string, score: number, total: number, minutes: number) => {
    const result: PracticeResult = { activityId, completedAt: new Date().toISOString(), score, total, minutes };
    setPersonal((current) => ({ ...current, practiceResults: [...current.practiceResults, result] }));
  }, []);

  const rateLesson = useCallback((lessonId: string, input: RateLessonInput) => studentId ? rateLessonService(studentId, lessonId, input) : notSignedIn, [studentId]);

  const purchaseCredits = useCallback((hours: number, amount: number) => studentId ? purchaseCreditsService(studentId, hours, amount) : notSignedIn, [studentId]);

  /** Demo reset: re-seeds the shared school (every role) and this student's personal data. */
  const resetWorkspace = useCallback(() => {
    // API mode owns the data; a leftover button must not resurrect the demo school.
    if (isApiDataMode()) return;
    resetSchool();
    setPersonal(createPersonalState(account));
  }, [account]);

  return {
    state,
    hydrated,
    tutors: shared.tutors,
    courseProgress: shared.course,
    getTutorSchedule,
    updateProfile,
    updateSettings,
    bookLesson,
    rescheduleLesson,
    cancelLesson,
    rebookLesson,
    rateLesson,
    toggleTask,
    submitAssignment,
    completePractice,
    purchaseCredits,
    resetWorkspace,
  };
}

export type StudentWorkspace = ReturnType<typeof useStudentWorkspace>;
export type { StudentAssignment, StudentLesson, StudentProfile, StudentSettings };
