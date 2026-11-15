"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultStudentProfile,
  defaultStudentSettings,
  studentAssignments,
  studentLessons,
  studentTransactionSeed,
} from "../../lib/data";
import { addMinutes, isoDaysFromNow, todayISO } from "../../lib/student";
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
  date: string;
  time: string;
  duration: number;
  title: string;
  tutor: string;
  tutorInitials: string;
  tutorColor: string;
  focus: string[];
  notes: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialState(account: Account): StudentWorkspaceState {
  return {
    profile: defaultStudentProfile(account),
    settings: clone(defaultStudentSettings),
    lessons: clone(studentLessons),
    assignments: clone(studentAssignments),
    completedTasks: [],
    practiceResults: [],
    creditHours: 24.5,
    transactions: clone(studentTransactionSeed),
  };
}

function sortLessons(items: StudentLesson[]) {
  return [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export default function useStudentWorkspace(account: Account) {
  const storageKey = `${STORAGE_PREFIX}${account.email.toLowerCase()}`;
  const [state, setState] = useState<StudentWorkspaceState>(() => createInitialState(account));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const base = createInitialState(account);
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<StudentWorkspaceState>;
          setState({
            ...base,
            ...parsed,
            profile: { ...base.profile, ...parsed.profile, email: account.email },
            settings: { ...base.settings, ...parsed.settings },
            lessons: parsed.lessons?.length ? sortLessons(parsed.lessons) : base.lessons,
            assignments: parsed.assignments?.length ? parsed.assignments : base.assignments,
            completedTasks: parsed.completedTasks ?? [],
            practiceResults: parsed.practiceResults ?? [],
            creditHours: Number.isFinite(parsed.creditHours) ? parsed.creditHours! : base.creditHours,
            transactions: parsed.transactions?.length ? parsed.transactions : base.transactions,
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
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [hydrated, state, storageKey]);

  const updateProfile = useCallback((profile: StudentProfile) => {
    setState((current) => ({ ...current, profile }));
  }, []);

  const updateSettings = useCallback((settings: StudentSettings) => {
    setState((current) => ({ ...current, settings }));
  }, []);

  const bookLesson = useCallback((input: BookLessonInput) => {
    const lesson: StudentLesson = {
      id: `lesson-${Date.now()}`,
      date: input.date || todayISO(),
      time: input.time,
      endTime: addMinutes(input.time, input.duration),
      duration: input.duration,
      title: input.title,
      tutor: input.tutor,
      tutorInitials: input.tutorInitials,
      tutorColor: input.tutorColor,
      focus: input.focus,
      status: "upcoming",
      roomCode: `ESL-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: input.notes,
    };
    setState((current) => ({ ...current, lessons: sortLessons([...current.lessons, lesson]) }));
    return lesson;
  }, []);

  const rescheduleLesson = useCallback((id: string, date: string, time: string, duration: number) => {
    setState((current) => ({
      ...current,
      lessons: sortLessons(current.lessons.map((lesson) => lesson.id === id
        ? { ...lesson, date, time, duration, endTime: addMinutes(time, duration), status: "upcoming" as const }
        : lesson)),
    }));
  }, []);

  const cancelLesson = useCallback((id: string, reason: string) => {
    setState((current) => ({
      ...current,
      lessons: current.lessons.map((lesson) => lesson.id === id
        ? { ...lesson, status: "cancelled" as const, cancelReason: reason }
        : lesson),
    }));
  }, []);

  const rebookLesson = useCallback((id: string) => {
    const original = state.lessons.find((lesson) => lesson.id === id);
    if (!original) return null;
    const lesson: StudentLesson = {
      ...clone(original),
      id: `lesson-${Date.now()}`,
      date: isoDaysFromNow(7),
      status: "upcoming",
      roomCode: `ESL-${Math.floor(1000 + Math.random() * 9000)}`,
      cancelReason: undefined,
      feedback: undefined,
      corrections: undefined,
      scores: undefined,
    };
    setState((current) => ({ ...current, lessons: sortLessons([...current.lessons, lesson]) }));
    return lesson;
  }, [state.lessons]);

  const toggleTask = useCallback((task: string) => {
    setState((current) => ({
      ...current,
      completedTasks: current.completedTasks.includes(task)
        ? current.completedTasks.filter((item) => item !== task)
        : [...current.completedTasks, task],
    }));
  }, []);

  const submitAssignment = useCallback((id: string, response: string) => {
    setState((current) => ({
      ...current,
      assignments: current.assignments.map((assignment) => assignment.id === id
        ? {
            ...assignment,
            status: "submitted" as const,
            response,
            submittedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          }
        : assignment),
    }));
  }, []);

  const completePractice = useCallback((activityId: string, score: number, total: number, minutes: number) => {
    const result: PracticeResult = {
      activityId,
      completedAt: new Date().toISOString(),
      score,
      total,
      minutes,
    };
    setState((current) => ({ ...current, practiceResults: [...current.practiceResults, result] }));
  }, []);

  const purchaseCredits = useCallback((hours: number, amount: number) => {
    setState((current) => ({
      ...current,
      creditHours: Number((current.creditHours + hours).toFixed(2)),
      transactions: [
        {
          id: `txn-${Date.now()}`,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          description: "Lesson credits top-up",
          hours,
          amount,
          status: "paid" as const,
        },
        ...current.transactions,
      ],
    }));
  }, []);

  const resetWorkspace = useCallback(() => {
    setState(createInitialState(account));
  }, [account]);

  return {
    state,
    hydrated,
    updateProfile,
    updateSettings,
    bookLesson,
    rescheduleLesson,
    cancelLesson,
    rebookLesson,
    toggleTask,
    submitAssignment,
    completePractice,
    purchaseCredits,
    resetWorkspace,
  };
}

export type StudentWorkspace = ReturnType<typeof useStudentWorkspace>;
export type { StudentAssignment, StudentLesson, StudentProfile, StudentSettings };
