"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultTeacherProfile, defaultTeacherSettings, teacherStudentsSeed, teacherTasksSeed } from "../../lib/data";
import { useCurrentUser } from "../../lib/hooks/useCurrentUser";
import { useSchool } from "../../lib/hooks/useSchool";
import { assignmentsForTeacher, findUserByEmail, getSchoolSnapshot, resetSchool, studentProfile, studentsForUser, teacherProfile, teacherScheduleView, toTeacherHomeworkView, type SchoolData, type SchoolUser } from "../../lib/school";
import {
  assignHomework as assignHomeworkService,
  completeLesson as completeLessonService,
  reviewHomework as reviewHomeworkService,
  updateMyName,
  openSlot as openSlotService,
  requestLessonCancellation as requestLessonCancellationService,
  requestSlotClosure as requestSlotClosureService,
  scheduleLessonForStudent,
  withdrawLessonCancellation,
  withdrawSlotClosure,
  type ServiceResult,
} from "../../lib/school/services";
import { initials } from "../../lib/student";
import type {
  Account,
  TeacherAttendance,
  TeacherLessonAttachment,
  TeacherProfile,
  TeacherSettings,
  TeacherStudent,
  TeacherTask,
  TeacherWorkspaceState,
} from "../../lib/types";

const STORAGE_PREFIX = "lumina-teacher-workspace:";

export type AddTeacherLessonInput = {
  studentId: string;
  date: string;
  time: string;
  duration: number;
  title: string;
  focus: string[];
  notes: string;
};

export type CompleteLessonInput = {
  attendance: TeacherAttendance;
  feedback: string;
  homework: string;
};

export type CancelLessonRequestInput = {
  reason: string;
  comment: string;
  attachment?: TeacherLessonAttachment;
};

/** Personal data only. Lessons, slots, and requests live in the shared school store. */
type TeacherPersonalState = {
  profile: TeacherProfile;
  settings: TeacherSettings;
  /** Private roster details (notes, homework, progress) keyed by student id. */
  students: TeacherStudent[];
  tasks: TeacherTask[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DEMO_TEACHER_EMAIL = "teacher@lumina.school";

/** The demo teacher starts with demo content; anyone else starts from their school record. */
function createPersonalState(account: Account): TeacherPersonalState {
  const defaults = defaultTeacherProfile(account);
  if (account.email.toLowerCase() === DEMO_TEACHER_EMAIL) {
    return { profile: defaults, settings: clone(defaultTeacherSettings), students: clone(teacherStudentsSeed), tasks: clone(teacherTasksSeed) };
  }
  const data = getSchoolSnapshot();
  const user = findUserByEmail(data, account.email);
  const record = user ? teacherProfile(data, user.id) : undefined;
  return {
    profile: {
      ...defaults,
      headline: record?.headline ?? "ESL teacher",
      bio: record?.bio ?? "",
      specializations: record?.specializations ?? [],
      languages: record?.languages ?? ["English"],
      yearsExperience: 0,
      certifications: "",
      memberSince: new Date(user?.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      weeklyGoalHours: record?.weeklyGoalHours ?? 20,
    },
    settings: clone(defaultTeacherSettings),
    students: [],
    tasks: [],
  };
}

function displayDate() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const notSignedIn: ServiceResult<never> = { ok: false, error: "Your account was not found in the school." };

/**
 * Roster = students the teacher teaches in the shared store, with this teacher's private details
 * (notes, progress). Homework comes from the shared store so the student sees it too.
 */
function buildRoster(data: SchoolData, teacher: SchoolUser | undefined, saved: TeacherStudent[]): TeacherStudent[] {
  if (!teacher) return saved;
  const byId = new Map(saved.map((student) => [student.id, student]));
  const homeworkByStudent = new Map<string, TeacherStudent["homework"]>();
  assignmentsForTeacher(data, teacher.id).forEach((assignment) => {
    homeworkByStudent.set(assignment.studentId, [...(homeworkByStudent.get(assignment.studentId) ?? []), toTeacherHomeworkView(assignment)]);
  });
  return studentsForUser(data, teacher).map((user) => {
    const details = byId.get(user.id);
    const profile = studentProfile(data, user.id);
    const homework = homeworkByStudent.get(user.id) ?? [];
    if (details) return { ...details, name: user.name, email: user.email, status: user.status === "paused" ? "paused" : details.status, homework };
    return {
      id: user.id,
      name: user.name,
      initials: initials(user.name),
      email: user.email,
      avatarColor: user.avatarColor,
      level: profile?.level ?? "",
      targetLevel: profile?.targetLevel ?? "",
      goal: profile?.goal ?? "",
      progress: 0,
      attendance: 100,
      lessonsCompleted: 0,
      status: user.status === "paused" ? "paused" : "active",
      notes: [],
      homework,
    };
  });
}

export default function useTeacherWorkspace(account: Account) {
  const storageKey = `${STORAGE_PREFIX}${account.email.toLowerCase()}`;
  const [personal, setPersonal] = useState<TeacherPersonalState>(() => createPersonalState(account));
  const [hydrated, setHydrated] = useState(false);
  const teacher = useCurrentUser(account);
  const teacherId = teacher?.id;

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const base = createPersonalState(account);
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<TeacherPersonalState>;
          setPersonal({
            profile: { ...base.profile, ...parsed.profile, email: account.email },
            settings: { ...base.settings, ...parsed.settings, defaultDuration: "25" },
            students: parsed.students?.length ? parsed.students : base.students,
            tasks: parsed.tasks?.length ? parsed.tasks : base.tasks,
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
    // Only personal fields are saved here; the old shared fields are dropped after migration.
    window.localStorage.setItem(storageKey, JSON.stringify(personal));
  }, [hydrated, personal, storageKey]);

  const selectShared = useCallback((data: SchoolData) => ({
    schedule: teacherId ? teacherScheduleView(data, teacherId) : { closedSlots: [], openedSlots: [], lessons: [] },
    roster: buildRoster(data, teacher, personal.students),
  }), [teacherId, teacher, personal.students]);
  const shared = useSchool(selectShared);

  const state: TeacherWorkspaceState = useMemo(() => ({
    profile: personal.profile,
    settings: personal.settings,
    tasks: personal.tasks,
    students: shared.roster,
    lessons: shared.schedule.lessons,
    closedSlots: shared.schedule.closedSlots,
    openedSlots: shared.schedule.openedSlots,
  }), [personal, shared]);

  const updateProfile = useCallback((profile: TeacherProfile) => {
    setPersonal((current) => ({ ...current, profile }));
    // The name is shared: managers, students, and the schedule show it.
    if (teacherId) updateMyName(teacherId, profile.name);
  }, [teacherId]);

  const updateSettings = useCallback((settings: TeacherSettings) => {
    setPersonal((current) => ({ ...current, settings }));
  }, []);

  const openSlot = useCallback((date: string, time: string) => teacherId ? openSlotService(teacherId, date, time) : Promise.resolve(notSignedIn), [teacherId]);
  const requestSlotClosure = useCallback((date: string, time: string, reason: string) => teacherId ? requestSlotClosureService(teacherId, date, time, reason) : Promise.resolve(notSignedIn), [teacherId]);
  const cancelSlotClosureRequest = useCallback((date: string, time: string) => teacherId ? withdrawSlotClosure(teacherId, date, time) : Promise.resolve(notSignedIn), [teacherId]);

  const addLesson = useCallback((input: AddTeacherLessonInput) => {
    if (!teacherId) return Promise.resolve(notSignedIn);
    return scheduleLessonForStudent(teacherId, { teacherId, studentId: input.studentId, date: input.date, time: input.time, title: input.title, focus: input.focus, notes: input.notes });
  }, [teacherId]);

  const requestLessonCancellation = useCallback((id: string, input: CancelLessonRequestInput) => teacherId ? requestLessonCancellationService(teacherId, id, input) : Promise.resolve(notSignedIn), [teacherId]);
  const withdrawLessonCancellationRequest = useCallback((id: string) => teacherId ? withdrawLessonCancellation(teacherId, id) : Promise.resolve(notSignedIn), [teacherId]);

  const completeLesson = useCallback(async (id: string, input: CompleteLessonInput) => {
    if (!teacherId) return notSignedIn;
    const studentId = state.lessons.find((lesson) => lesson.id === id)?.studentId;
    const result = await completeLessonService(teacherId, id, input);
    // Keep this teacher's private roster counters in step, as before.
    if (result.ok && result.value.firstCompletion && studentId) {
      const attended = input.attendance === "attended";
      setPersonal((current) => ({
        ...current,
        students: current.students.map((student) => {
          if (student.id !== studentId) return student;
          const priorLessons = student.lessonsCompleted;
          const priorAttended = Math.round((student.attendance / 100) * priorLessons);
          const nextLessons = priorLessons + 1;
          return { ...student, lessonsCompleted: nextLessons, attendance: Math.round(((priorAttended + (attended ? 1 : 0)) / nextLessons) * 100) };
        }),
      }));
    }
    return result;
  }, [teacherId, state.lessons]);

  const toggleTask = useCallback((id: string) => {
    setPersonal((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }));
  }, []);

  /** Edits private roster details, creating them from the shared roster entry if needed. */
  const updateRosterStudent = useCallback((studentId: string, change: (student: TeacherStudent) => TeacherStudent) => {
    setPersonal((current) => {
      const existing = current.students.find((student) => student.id === studentId) ?? state.students.find((student) => student.id === studentId);
      if (!existing) return current;
      const others = current.students.filter((student) => student.id !== studentId);
      return { ...current, students: [...others, change(existing)] };
    });
  }, [state.students]);

  const addStudentNote = useCallback((studentId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    updateRosterStudent(studentId, (student) => ({ ...student, notes: [{ id: `note-${Date.now()}`, date: displayDate(), body: trimmed }, ...student.notes] }));
  }, [updateRosterStudent]);

  /** Shared homework: the student sees it on their Assignments page. */
  const assignHomework = useCallback((studentId: string, title: string, dueLabel: string) => (
    teacherId ? assignHomeworkService(teacherId, studentId, { title, dueLabel }) : notSignedIn
  ), [teacherId]);

  const reviewHomework = useCallback((homeworkId: string, feedback: string, grade: string) => (
    teacherId ? reviewHomeworkService(teacherId, homeworkId, { feedback, grade }) : notSignedIn
  ), [teacherId]);

  /** Demo reset: re-seeds the shared school (every role) and this teacher's personal data. */
  const resetWorkspace = useCallback(() => {
    resetSchool();
    setPersonal(createPersonalState(account));
  }, [account]);

  return {
    state,
    hydrated,
    updateProfile,
    updateSettings,
    openSlot,
    requestSlotClosure,
    cancelSlotClosureRequest,
    addLesson,
    requestLessonCancellation,
    withdrawLessonCancellationRequest,
    completeLesson,
    toggleTask,
    addStudentNote,
    assignHomework,
    reviewHomework,
    resetWorkspace,
  };
}

export type TeacherWorkspace = ReturnType<typeof useTeacherWorkspace>;
