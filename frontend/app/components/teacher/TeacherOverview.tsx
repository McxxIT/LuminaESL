"use client";

import { useMemo } from "react";
import Icon from "../Icon";
import { buildDaySlots, formatSlotTiming, type DaySlot } from "../../lib/scheduling";
import { formatLessonDate, parseISODate, todayISO } from "../../lib/student";
import type {
  TeacherLesson,
  TeacherProfile,
  TeacherSlotClosure,
  TeacherSlotOpening,
  TeacherStudent,
  TeacherTask,
} from "../../lib/types";

type OverviewProps = {
  profile: TeacherProfile;
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  tasks: TeacherTask[];
  closedSlots: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  onToggleTask: (id: string) => void;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

function withinLastDays(date: string, days: number) {
  const diff = (parseISODate(todayISO()).getTime() - parseISODate(date).getTime()) / 86_400_000;
  return diff >= 0 && diff < days;
}

export default function TeacherOverview({ profile, lessons, students, tasks, closedSlots, openedSlots, onToggleTask, onNavigate, onNotice }: OverviewProps) {
  const today = todayISO();
  const todaysLessons = useMemo(
    () => lessons.filter((lesson) => lesson.date === today).sort((a, b) => a.time.localeCompare(b.time)),
    [lessons, today],
  );
  const upcoming = useMemo(
    () => lessons
      .filter((lesson) => (lesson.status === "scheduled" || lesson.status === "live") && lesson.date >= today)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [lessons, today],
  );
  const nextLesson = upcoming[0];
  const activeStudents = students.filter((student) => student.status !== "paused");
  const weeklyHours = lessons
    .filter((lesson) => lesson.status === "completed" && withinLastDays(lesson.date, 7))
    .reduce((total, lesson) => total + lesson.duration / 60, 0);
  const openTasks = tasks.filter((task) => !task.done).length;
  const todaySlots = useMemo<DaySlot[]>(
    () => buildDaySlots({ date: today, closures: closedSlots, openedSlots, lessons, includeClosed: true }),
    [closedSlots, openedSlots, lessons, today],
  );
  const nextBookedSlot = todaySlots.find((slot) => slot.status === "booked" && slot.lesson);
  const nextBookingTiming = nextBookedSlot?.lesson
    ? formatSlotTiming(today, nextBookedSlot.lesson.time, nextBookedSlot.lesson.endTime ?? nextBookedSlot.endTime)
    : "";
  const openSlotCount = todaySlots.filter((slot) => slot.status === "open").length;
  const pendingClosureCount = todaySlots.filter((slot) => slot.status === "pending").length;
  const topStudents = [...activeStudents].sort((a, b) => b.progress - a.progress).slice(0, 4);
  const averageProgress = Math.round(activeStudents.reduce((total, student) => total + student.progress, 0) / Math.max(activeStudents.length, 1));
  const upcomingWithMaterial = upcoming.filter((lesson) => lesson.material).length;

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">TEACHER WORKSPACE</p>
        <h1>Good to see you, {profile.name.split(" ")[0]} <span>✦</span></h1>
        <p className="subheading">Your lessons, students, and feedback for the day are ready.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="primary-button" onClick={() => onNavigate("Booking slots")}><Icon name="clock" size={16} /> Open slots</button>
      </div>
    </section>

    <section className="student-metrics">
      <article className="role-card"><div className="metric-icon blue"><Icon name="calendar" /></div><div><span>TODAY&apos;S LESSONS</span><strong>{todaysLessons.length}</strong><small>{todaysLessons.filter((lesson) => lesson.status === "completed").length} completed · {todaysLessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "live").length} remaining</small></div></article>
      <article className="role-card"><div className="metric-icon green"><Icon name="users" /></div><div><span>ACTIVE STUDENTS</span><strong>{activeStudents.length}</strong><small>{students.filter((student) => student.status === "at-risk").length} need attention</small></div></article>
      <article className="role-card"><div className="metric-icon violet"><Icon name="clock" /></div><div><span>HOURS THIS WEEK</span><strong>{weeklyHours.toFixed(1)} <em>hrs</em></strong><small>{Math.min(100, Math.round((weeklyHours / profile.weeklyGoalHours) * 100))}% of weekly goal</small></div></article>
      <article className="role-card"><div className="metric-icon orange"><Icon name="check" /></div><div><span>OPEN TASKS</span><strong>{openTasks}</strong><small>{tasks.length - openTasks} completed</small></div></article>
    </section>

    <div className="student-dashboard-grid">
      <div className="student-dashboard-main">
        <section className="panel student-panel">
          <div className="panel-header">
            <div><h2>Today&apos;s schedule</h2><p>{formatLessonDate(today)} · {todaysLessons.length} lesson{todaysLessons.length === 1 ? "" : "s"}</p></div>
            <button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Full schedule <Icon name="arrow" size={14} /></button>
          </div>
          <div className="student-week-list">
            {todaysLessons.map((lesson) => <button type="button" className={`role-lesson-row ${lesson.status}`} key={lesson.id} onClick={() => onNavigate("Lessons")} style={{ borderTop: "1px solid #f1f5f9" }}>
              <span className="mono">{lesson.time}</span>
              <span><strong>{lesson.title}</strong><small>{lesson.studentName} · {lesson.focus.join(" · ")}</small></span>
              <Icon name="arrow" size={16} />
            </button>)}
            {todaysLessons.length === 0 && <div className="student-empty-inline"><Icon name="calendar" /><p>No lessons today. Add a 25-minute lesson or open your booking slots.</p><button type="button" className="primary-button" onClick={() => onNavigate("Lessons")}>Open lessons</button></div>}
          </div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header">
            <div><h2>Teaching tasks</h2><p>Small actions that keep students moving</p></div>
            <span className="setting-count">{openTasks} open</span>
          </div>
          <div className="task-list">
            {tasks.map((task) => <button type="button" className={`task-row ${task.done ? "completed" : ""}`} key={task.id} onClick={() => { onToggleTask(task.id); onNotice(`${task.title} ${task.done ? "reopened" : "completed"}.`); }}>
              <span className="task-check">{task.done ? "✓" : ""}</span>
              <span>{task.title}<small>{task.detail} · {task.dueLabel}</small></span>
              <Icon name="arrow" size={14} />
            </button>)}
          </div>
        </section>
      </div>

      <aside className="student-dashboard-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Student progress</h2><p>Top learners this month · {averageProgress}% average</p></div></div>
          <div className="student-progress-snapshot">
            {topStudents.map((student) => <div className="student-mini-skill" key={student.id}>
              <div><span>{student.name}</span><strong>{student.progress}%</strong></div>
              <div className="bar"><i style={{ width: `${student.progress}%` }} /></div>
            </div>)}
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Students")}>View all students <Icon name="arrow" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Booking slots</h2><p>Closed by default · open the slots you want to teach</p></div><span className="setting-count">{openSlotCount} open today</span></div>
          <div className="teacher-booking-summary">
            <div><span>Open today</span><strong>{openSlotCount} of {todaySlots.length} slots</strong></div>
            <div><span>Next booking</span><strong>{nextBookedSlot ? nextBookingTiming : "Nothing booked"}</strong></div>
            <div><span>Pending closures</span><strong>{pendingClosureCount}</strong></div>
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Booking slots")}>Manage bookings <Icon name="arrow" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel student-streak-card">
          <div className="student-streak-icon"><Icon name="file" size={22} /></div>
          <div><span className="eyebrow">LESSON MATERIALS</span><h2>{upcomingWithMaterial} of {upcoming.length} ready</h2><p>{upcoming.length - upcomingWithMaterial > 0 ? `${upcoming.length - upcomingWithMaterial} upcoming lesson${upcoming.length - upcomingWithMaterial === 1 ? " is" : "s are"} still waiting for a plan from your manager.` : "Every upcoming lesson has a plan from your manager."}</p><button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Open lessons <Icon name="arrow" size={14} /></button></div>
        </section>
      </aside>
    </div>

    <section className="student-footer-strip">
      <div><span className="eyebrow">NEXT LESSON</span><strong>{nextLesson ? `${formatLessonDate(nextLesson.date)} · ${nextLesson.time} · ${nextLesson.studentName}` : "Nothing scheduled"}</strong></div>
      <div><span className="eyebrow">WEEKLY TARGET</span><strong>{profile.weeklyGoalHours} teaching hours</strong></div>
      <div><span className="eyebrow">STUDENTS NEEDING ATTENTION</span><strong>{students.filter((student) => student.status === "at-risk").length}</strong></div>
      <button type="button" className="text-button" onClick={() => onNavigate(nextLesson ? "Lessons" : "Students")}>{nextLesson ? "Review lessons" : "Check students"} <Icon name="arrow" size={14} /></button>
    </section>
  </div>;
}
