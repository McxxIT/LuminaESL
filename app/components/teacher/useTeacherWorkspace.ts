"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultTeacherProfile,
  defaultTeacherSettings,
  teacherAvailabilitySeed,
  teacherCurriculumSeed,
  teacherLessonsSeed,
  teacherStudentsSeed,
  teacherTasksSeed,
} from "../../lib/data";
import { addMinutes, todayISO } from "../../lib/student";
import type {
  Account,
  CurriculumUnit,
  TeacherAttendance,
  TeacherLesson,
  TeacherProfile,
  TeacherSettings,
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

export type CurriculumUnitInput = {
  title: string;
  level: string;
  summary: string;
  objectives: string[];
  lessons: { title: string; focus: string; minutes: number }[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialState(account: Account): TeacherWorkspaceState {
  return {
    profile: defaultTeacherProfile(account),
    settings: clone(defaultTeacherSettings),
    availability: clone(teacherAvailabilitySeed),
    lessons: clone(teacherLessonsSeed),
    students: clone(teacherStudentsSeed),
    tasks: clone(teacherTasksSeed),
    curriculum: clone(teacherCurriculumSeed),
  };
}

function sortLessons(items: TeacherLesson[]) {
  return [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function displayDate() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function useTeacherWorkspace(account: Account) {
  const storageKey = `${STORAGE_PREFIX}${account.email.toLowerCase()}`;
  const [state, setState] = useState<TeacherWorkspaceState>(() => createInitialState(account));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const base = createInitialState(account);
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<TeacherWorkspaceState>;
          setState({
            ...base,
            ...parsed,
            profile: { ...base.profile, ...parsed.profile, email: account.email },
            settings: { ...base.settings, ...parsed.settings },
            availability: parsed.availability?.length ? parsed.availability : base.availability,
            lessons: parsed.lessons?.length ? sortLessons(parsed.lessons) : base.lessons,
            students: parsed.students?.length ? parsed.students : base.students,
            tasks: parsed.tasks?.length ? parsed.tasks : base.tasks,
            curriculum: parsed.curriculum?.length ? parsed.curriculum : base.curriculum,
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

  const updateProfile = useCallback((profile: TeacherProfile) => {
    setState((current) => ({ ...current, profile }));
  }, []);

  const updateSettings = useCallback((settings: TeacherSettings) => {
    setState((current) => ({ ...current, settings }));
  }, []);

  const setAvailabilityActive = useCallback((active: boolean) => {
    setState((current) => ({ ...current, availability: current.availability.map((slot) => ({ ...slot, active })) }));
  }, []);

  const toggleAvailability = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      availability: current.availability.map((slot) => slot.id === id ? { ...slot, active: !slot.active } : slot),
    }));
  }, []);

  const addLesson = useCallback((input: AddTeacherLessonInput) => {
    setState((current) => {
      const student = current.students.find((item) => item.id === input.studentId);
      if (!student) return current;
      const created: TeacherLesson = {
        id: `teacher-lesson-${Date.now()}`,
        date: input.date || todayISO(),
        time: input.time,
        endTime: addMinutes(input.time, input.duration),
        duration: input.duration,
        title: input.title,
        focus: input.focus,
        studentId: student.id,
        studentName: student.name,
        studentInitials: student.initials,
        studentColor: student.avatarColor,
        status: "scheduled",
        roomCode: `ESL-${Math.floor(1000 + Math.random() * 9000)}`,
        notes: input.notes,
      };
      return { ...current, lessons: sortLessons([...current.lessons, created]) };
    });
  }, []);

  const rescheduleLesson = useCallback((id: string, date: string, time: string, duration: number) => {
    setState((current) => ({
      ...current,
      lessons: sortLessons(current.lessons.map((lesson) => lesson.id === id
        ? { ...lesson, date, time, duration, endTime: addMinutes(time, duration), status: "scheduled" as const, cancelReason: undefined }
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

  const startLesson = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      lessons: current.lessons.map((lesson) => lesson.id === id ? { ...lesson, status: "live" as const } : lesson),
    }));
  }, []);

  const completeLesson = useCallback((id: string, input: CompleteLessonInput) => {
    setState((current) => {
      const lesson = current.lessons.find((item) => item.id === id);
      if (!lesson) return current;
      const attended = input.attendance === "attended";
      const alreadyCompleted = lesson.status === "completed";
      return {
        ...current,
        lessons: current.lessons.map((item) => item.id === id
          ? {
              ...item,
              status: "completed" as const,
              attendance: input.attendance,
              feedback: input.feedback.trim() || undefined,
              homework: input.homework.trim() || undefined,
            }
          : item),
        students: alreadyCompleted ? current.students : current.students.map((student) => {
          if (student.id !== lesson.studentId) return student;
          const priorLessons = student.lessonsCompleted;
          const priorAttended = Math.round((student.attendance / 100) * priorLessons);
          const nextLessons = priorLessons + 1;
          return {
            ...student,
            lessonsCompleted: nextLessons,
            attendance: Math.round(((priorAttended + (attended ? 1 : 0)) / nextLessons) * 100),
          };
        }),
      };
    });
  }, []);

  const toggleTask = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task),
    }));
  }, []);

  const addStudentNote = useCallback((studentId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      students: current.students.map((student) => student.id === studentId
        ? {
            ...student,
            notes: [{ id: `note-${Date.now()}`, date: displayDate(), body: trimmed }, ...student.notes],
          }
        : student),
    }));
  }, []);

  const assignHomework = useCallback((studentId: string, title: string, dueLabel: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      students: current.students.map((student) => student.id === studentId
        ? {
            ...student,
            homework: [
              {
                id: `homework-${Date.now()}`,
                title: trimmed,
                assignedAt: displayDate(),
                dueLabel: dueLabel.trim() || "No due date",
                status: "assigned" as const,
              },
              ...student.homework,
            ],
          }
        : student),
    }));
  }, []);

  const reviewHomework = useCallback((studentId: string, homeworkId: string) => {
    setState((current) => ({
      ...current,
      students: current.students.map((student) => student.id === studentId
        ? {
            ...student,
            homework: student.homework.map((item) => item.id === homeworkId
              ? { ...item, status: "reviewed" as const }
              : item),
          }
        : student),
    }));
  }, []);

  const createUnit = useCallback((input: CurriculumUnitInput) => {
    setState((current) => {
      const order = current.curriculum.reduce((max, unit) => Math.max(max, unit.order), 0) + 1;
      const id = `unit-${Date.now()}`;
      const created: CurriculumUnit = {
        id,
        title: input.title,
        level: input.level,
        summary: input.summary,
        objectives: input.objectives,
        lessons: input.lessons.map((lesson, index) => ({
          id: `${id}-lesson-${index + 1}`,
          title: lesson.title,
          focus: lesson.focus,
          minutes: lesson.minutes,
        })),
        status: "draft",
        order,
        updatedAt: displayDate(),
      };
      return { ...current, curriculum: [...current.curriculum, created].sort((a, b) => a.order - b.order) };
    });
  }, []);

  const updateUnit = useCallback((id: string, input: CurriculumUnitInput) => {
    setState((current) => ({
      ...current,
      curriculum: current.curriculum.map((unit) => unit.id === id
        ? {
            ...unit,
            title: input.title,
            level: input.level,
            summary: input.summary,
            objectives: input.objectives,
            lessons: input.lessons.map((lesson, index) => ({
              id: `${unit.id}-lesson-${index + 1}`,
              title: lesson.title,
              focus: lesson.focus,
              minutes: lesson.minutes,
            })),
            updatedAt: displayDate(),
          }
        : unit),
    }));
  }, []);

  const toggleUnitPublish = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      curriculum: current.curriculum.map((unit) => unit.id === id
        ? { ...unit, status: unit.status === "published" ? "draft" as const : "published" as const, updatedAt: displayDate() }
        : unit),
    }));
  }, []);

  const moveUnit = useCallback((id: string, direction: -1 | 1) => {
    setState((current) => {
      const ordered = [...current.curriculum].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((unit) => unit.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return current;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return {
        ...current,
        curriculum: ordered.map((unit, position) => ({ ...unit, order: position + 1 })),
      };
    });
  }, []);

  const resetWorkspace = useCallback(() => {
    setState(createInitialState(account));
  }, [account]);

  return {
    state,
    hydrated,
    updateProfile,
    updateSettings,
    setAvailabilityActive,
    toggleAvailability,
    addLesson,
    rescheduleLesson,
    cancelLesson,
    startLesson,
    completeLesson,
    toggleTask,
    addStudentNote,
    assignHomework,
    reviewHomework,
    createUnit,
    updateUnit,
    toggleUnitPublish,
    moveUnit,
    resetWorkspace,
  };
}

export type TeacherWorkspace = ReturnType<typeof useTeacherWorkspace>;
