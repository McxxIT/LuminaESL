"use client";

import { useMemo } from "react";
import Icon from "../Icon";
import { downloadTextFile, isoDaysFromNow, parseISODate } from "../../lib/student";
import type { CurriculumUnit, TeacherLesson, TeacherStudent } from "../../lib/types";

type AnalyticsProps = {
  students: TeacherStudent[];
  lessons: TeacherLesson[];
  curriculum: CurriculumUnit[];
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

export default function TeacherAnalytics({ students, lessons, curriculum, onNavigate, onNotice }: AnalyticsProps) {
  const completed = useMemo(() => lessons.filter((lesson) => lesson.status === "completed"), [lessons]);
  const cancelled = lessons.filter((lesson) => lesson.status === "cancelled");
  const scheduled = lessons.filter((lesson) => lesson.status === "scheduled");
  const live = lessons.filter((lesson) => lesson.status === "live");
  const hoursTaught = completed.reduce((total, lesson) => total + lesson.duration / 60, 0);
  const attendanceLessons = completed.filter((lesson) => lesson.attendance);
  const attendedLessons = attendanceLessons.filter((lesson) => lesson.attendance === "attended").length;
  const attendanceRate = attendanceLessons.length ? Math.round((attendedLessons / attendanceLessons.length) * 100) : 0;
  const activeStudents = students.filter((student) => student.status !== "paused");
  const averageProgress = Math.round(students.reduce((total, student) => total + student.progress, 0) / Math.max(students.length, 1));
  const atRisk = students.filter((student) => student.status === "at-risk");
  const publishedUnits = curriculum.filter((unit) => unit.status === "published").length;

  const weekly = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = isoDaysFromNow(index - 6);
    const hours = completed
      .filter((lesson) => lesson.date === date)
      .reduce((total, lesson) => total + lesson.duration / 60, 0);
    return {
      date,
      hours,
      label: parseISODate(date).toLocaleDateString("en-US", { weekday: "short" }),
    };
  }), [completed]);

  const chartMax = Math.max(...weekly.map((day) => day.hours), 1);
  const weekHours = weekly.reduce((total, day) => total + day.hours, 0);
  const topStudents = [...activeStudents].sort((a, b) => b.progress - a.progress).slice(0, 4);

  function downloadReport() {
    const lines = [
      "LUMINA ESL — TEACHING ANALYTICS",
      "================================",
      `Hours taught: ${hoursTaught.toFixed(1)}`,
      `Lessons completed: ${completed.length}`,
      `Lessons scheduled: ${scheduled.length}`,
      `Lessons cancelled: ${cancelled.length}`,
      `Attendance rate: ${attendanceRate}%`,
      `Active students: ${activeStudents.length}`,
      `Average progress: ${averageProgress}%`,
      `Published curriculum units: ${publishedUnits} of ${curriculum.length}`,
      "",
      "STUDENT BREAKDOWN",
      ...students.map((student) => `${student.name} · ${student.level} · ${student.progress}% progress · ${student.attendance}% attendance · ${student.status}`),
      "",
      "STUDENTS NEEDING ATTENTION",
      ...(atRisk.length ? atRisk.map((student) => `${student.name}: ${student.goal}`) : ["None"]),
    ];
    downloadTextFile("lumina-teaching-analytics.txt", lines.join("\n"));
    onNotice("Teaching analytics report downloaded.");
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHING ANALYTICS</p><h1>How your teaching is landing</h1><p className="subheading">A live view of lesson volume, attendance, student progress, and curriculum coverage.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={downloadReport}><Icon name="download" size={15} /> Download report</button>
        <button type="button" className="primary-button" onClick={() => onNavigate("Students")}>Open roster <Icon name="arrow" size={15} /></button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="clock" /></span><div><span>HOURS TAUGHT</span><strong>{hoursTaught.toFixed(1)} <em>hrs</em></strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>LESSONS COMPLETED</span><strong>{completed.length}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="users" /></span><div><span>ATTENDANCE</span><strong>{attendanceRate}%</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="chart" /></span><div><span>AVG PROGRESS</span><strong>{averageProgress}%</strong></div></article>
    </section>

    <div className="student-progress-columns">
      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Teaching hours</h2><p>Completed lesson time · last 7 days</p></div><span className="student-trend"><Icon name="clock" size={14} /> {weekHours.toFixed(1)} hrs</span></div>
        <div className="student-activity-chart">
          {weekly.map((day) => <div className="activity-bar-wrap" key={day.date}>
            <span>{day.hours > 0 ? day.hours.toFixed(1) : "0"}</span>
            <div className="activity-bar"><i style={{ height: `${Math.round((day.hours / chartMax) * 100)}%` }} /></div>
            <small>{day.label}</small>
          </div>)}
        </div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Lesson outcomes</h2><p>Across your current schedule</p></div></div>
        <div className="teacher-outcome-list">
          <div className="teacher-outcome-row"><span className="metric-icon green"><Icon name="check" /></span><div><strong>Completed</strong><small>{attendedLessons} attended · {attendanceLessons.length - attendedLessons} no-show</small></div><em>{completed.length}</em></div>
          <div className="teacher-outcome-row"><span className="metric-icon blue"><Icon name="calendar" /></span><div><strong>Scheduled</strong><small>{scheduled.length} upcoming lessons</small></div><em>{scheduled.length}</em></div>
          <div className="teacher-outcome-row"><span className="metric-icon orange"><Icon name="play" /></span><div><strong>Live now</strong><small>Classrooms currently open</small></div><em>{live.length}</em></div>
          <div className="teacher-outcome-row"><span className="metric-icon violet"><Icon name="x" /></span><div><strong>Cancelled</strong><small>Student or teacher cancellations</small></div><em>{cancelled.length}</em></div>
        </div>
        <div className="teacher-analytics-note"><Icon name="target" size={16} /><p>{atRisk.length > 0 ? `${atRisk.map((student) => student.name.split(" ")[0]).join(", ")} need a check-in this week.` : "Every active student is on track this week."}</p></div>
      </section>
    </div>

    <div className="student-progress-columns">
      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Student progress</h2><p>Course completion and attendance</p></div><button type="button" className="text-button" onClick={() => onNavigate("Students")}>Full roster <Icon name="arrow" size={14} /></button></div>
        <div className="teacher-analytics-students">
          {[...students].sort((a, b) => b.progress - a.progress).map((student) => <div className="teacher-analytics-student" key={student.id}>
            <div className={`avatar avatar-${student.avatarColor}`}>{student.initials}</div>
            <div className="teacher-analytics-student-copy"><strong>{student.name}</strong><small>{student.level} · {student.attendance}% attendance</small><div className="bar"><i style={{ width: `${student.progress}%` }} /></div></div>
            <em>{student.progress}%</em>
          </div>)}
        </div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Needs attention</h2><p>Students with the lowest progress or attendance</p></div></div>
        <div className="teacher-attention-list">
          {atRisk.length > 0 ? atRisk.map((student) => <button type="button" className="teacher-attention-row" key={student.id} onClick={() => onNavigate("Students")}>
            <div className={`avatar avatar-${student.avatarColor}`}>{student.initials}</div>
            <div><strong>{student.name}</strong><small>{student.attendance}% attendance · {student.progress}% progress</small></div>
            <Icon name="chevronRight" size={15} />
          </button>) : <div className="student-empty-inline"><Icon name="check" /><p>No students are flagged for attention right now.</p></div>}
        </div>
        <div className="teacher-analytics-note"><Icon name="sparkles" size={16} /><p>Small check-ins before the next lesson have the biggest impact on retention.</p></div>
      </section>
    </div>

    <section className="panel student-panel">
      <div className="panel-header"><div><h2>Curriculum coverage</h2><p>{publishedUnits} of {curriculum.length} units published · {curriculum.reduce((total, unit) => total + unit.lessons.length, 0)} lessons planned</p></div><button type="button" className="text-button" onClick={() => onNavigate("Curriculum")}>Open curriculum <Icon name="arrow" size={14} /></button></div>
      <div className="teacher-coverage-list">
        {[...curriculum].sort((a, b) => a.order - b.order).map((unit) => <div className="teacher-coverage-row" key={unit.id}>
          <div><strong>{unit.title}</strong><small>{unit.level} · {unit.lessons.length} lessons</small></div>
          <div className="bar"><i className={unit.status === "published" ? "green-bar" : "secondary-bar"} style={{ width: `${unit.status === "published" ? 100 : 42}%` }} /></div>
          <span className={`teacher-unit-status ${unit.status}`}>{unit.status}</span>
        </div>)}
      </div>
    </section>

    <section className="student-footer-strip">
      <div><span className="eyebrow">TOP LEARNER</span><strong>{topStudents[0] ? `${topStudents[0].name} · ${topStudents[0].progress}%` : "No students yet"}</strong></div>
      <div><span className="eyebrow">ACTIVE STUDENTS</span><strong>{activeStudents.length} of {students.length}</strong></div>
      <div><span className="eyebrow">ATTENDANCE RATE</span><strong>{attendanceRate}%</strong></div>
      <button type="button" className="text-button" onClick={() => onNavigate("Students")}>Review students <Icon name="arrow" size={14} /></button>
    </section>
  </div>;
}
