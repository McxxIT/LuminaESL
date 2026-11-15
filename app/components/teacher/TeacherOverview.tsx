"use client";

import { useMemo } from "react";
import Icon from "../Icon";
import { formatLessonDate, parseISODate, todayISO } from "../../lib/student";
import type {
  CurriculumUnit,
  TeacherAvailability,
  TeacherLesson,
  TeacherProfile,
  TeacherStudent,
  TeacherTask,
} from "../../lib/types";

type OverviewProps = {
  profile: TeacherProfile;
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  tasks: TeacherTask[];
  availability: TeacherAvailability[];
  curriculum: CurriculumUnit[];
  onToggleTask: (id: string) => void;
  onSetAvailabilityActive: (active: boolean) => void;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const teacherDayLabels: Record<TeacherAvailability["day"], string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

function withinLastDays(date: string, days: number) {
  const diff = (parseISODate(todayISO()).getTime() - parseISODate(date).getTime()) / 86_400_000;
  return diff >= 0 && diff < days;
}

export default function TeacherOverview({ profile, lessons, students, tasks, availability, curriculum, onToggleTask, onSetAvailabilityActive, onNavigate, onNotice }: OverviewProps) {
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
  const availabilityOn = availability.some((slot) => slot.active);
  const activeSlots = availability.filter((slot) => slot.active);
  const topStudents = [...activeStudents].sort((a, b) => b.progress - a.progress).slice(0, 4);
  const averageProgress = Math.round(activeStudents.reduce((total, student) => total + student.progress, 0) / Math.max(activeStudents.length, 1));
  const publishedUnits = curriculum.filter((unit) => unit.status === "published").length;

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">TEACHER WORKSPACE</p>
        <h1>Good to see you, {profile.name.split(" ")[0]} <span>✦</span></h1>
        <p className="subheading">Your lessons, students, and feedback for the day are ready.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className={`availability-button ${availabilityOn ? "is-available" : ""}`} onClick={() => { onSetAvailabilityActive(!availabilityOn); onNotice(`You are now ${availabilityOn ? "unavailable" : "available"} for new lessons.`); }}><i /> {availabilityOn ? "Available for lessons" : "Unavailable"}</button>
        <button type="button" className="primary-button" onClick={() => onNavigate("Schedule")}><Icon name="calendarAdd" size={16} /> Open schedule</button>
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
            <button type="button" className="text-button" onClick={() => onNavigate("Schedule")}>Full schedule <Icon name="arrow" size={14} /></button>
          </div>
          <div className="student-week-list">
            {todaysLessons.map((lesson) => <button type="button" className={`role-lesson-row ${lesson.status}`} key={lesson.id} onClick={() => onNavigate("Schedule")} style={{ borderTop: "1px solid #f1f5f9" }}>
              <span className="mono">{lesson.time}</span>
              <span><strong>{lesson.title}</strong><small>{lesson.studentName} · {lesson.duration} min · {lesson.focus.join(" · ")}</small></span>
              <Icon name="arrow" size={16} />
            </button>)}
            {todaysLessons.length === 0 && <div className="student-empty-inline"><Icon name="calendar" /><p>No lessons today. Use the schedule to add a session or review availability.</p><button type="button" className="primary-button" onClick={() => onNavigate("Schedule")}>Open schedule</button></div>}
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
          <div className="panel-header"><div><h2>Availability</h2><p>{activeSlots.length} open block{activeSlots.length === 1 ? "" : "s"} this week</p></div></div>
          <div className="teacher-availability-mini">
            {activeSlots.length > 0 ? activeSlots.slice(0, 5).map((slot) => <div className="teacher-availability-row" key={slot.id}>
              <span className="teacher-availability-dot" />
              <span>{teacherDayLabels[slot.day]}</span>
              <strong>{slot.startTime}–{slot.endTime}</strong>
            </div>) : <div className="student-empty-inline"><Icon name="clock" /><p>You are marked unavailable. Turn availability back on to keep taking bookings.</p></div>}
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Schedule")}>Manage availability <Icon name="arrow" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel student-streak-card">
          <div className="student-streak-icon"><Icon name="book" size={22} /></div>
          <div><span className="eyebrow">CURRICULUM</span><h2>{publishedUnits} published unit{publishedUnits === 1 ? "" : "s"}</h2><p>Keep lesson plans current so students always know what comes next.</p><button type="button" className="text-button" onClick={() => onNavigate("Curriculum")}>Open curriculum <Icon name="arrow" size={14} /></button></div>
        </section>
      </aside>
    </div>

    <section className="student-footer-strip">
      <div><span className="eyebrow">NEXT LESSON</span><strong>{nextLesson ? `${formatLessonDate(nextLesson.date)} · ${nextLesson.time} · ${nextLesson.studentName}` : "Nothing scheduled"}</strong></div>
      <div><span className="eyebrow">WEEKLY TARGET</span><strong>{profile.weeklyGoalHours} teaching hours</strong></div>
      <div><span className="eyebrow">STUDENTS NEEDING ATTENTION</span><strong>{students.filter((student) => student.status === "at-risk").length}</strong></div>
      <button type="button" className="text-button" onClick={() => onNavigate(nextLesson ? "Schedule" : "Students")}>{nextLesson ? "Review schedule" : "Check students"} <Icon name="arrow" size={14} /></button>
    </section>
  </div>;
}
