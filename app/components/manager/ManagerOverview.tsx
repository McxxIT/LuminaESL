"use client";

import { useCallback } from "react";
import Icon from "../Icon";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  lessonPlanForLesson,
  lessonsForUser,
  managerIdForTeacher,
  nameOf,
  performanceForTeacher,
  studentsForUser,
  teachersForUser,
  usersByRole,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { formatLessonDate, isoDaysFromNow, todayISO } from "../../lib/student";
import { firstName, LessonStatusBadge, PersonAvatar, ScorePill } from "./parts";

function selectOverview(data: SchoolData, user: SchoolUser) {
  const today = todayISO();
  const weekEnd = isoDaysFromNow(7);
  const teachers = teachersForUser(data, user);
  const students = studentsForUser(data, user);
  const lessons = lessonsForUser(data, user);
  const todays = lessons.filter((lesson) => lesson.date === today);
  const upcomingWeek = lessons.filter((lesson) => lesson.status === "scheduled" && lesson.date >= today && lesson.date <= weekEnd);
  const team = teachers.map((teacher) => {
    const teacherLessons = lessons.filter((lesson) => lesson.teacherId === teacher.id);
    const next = teacherLessons.find((lesson) => (lesson.status === "scheduled" || lesson.status === "live") && lesson.date >= today);
    return {
      teacher,
      managerName: nameOf(data, managerIdForTeacher(data, teacher.id), "Unassigned"),
      performance: performanceForTeacher(data, teacher.id),
      studentCount: studentsForUser(data, teacher).length,
      next,
      nextStudent: next ? nameOf(data, next.studentId) : "",
    };
  }).sort((a, b) => a.performance.score - b.performance.score);

  return {
    teachers,
    students,
    activeStudents: students.filter((student) => student.status === "active").length,
    managerCount: usersByRole(data, "manager").length,
    todays: todays.map((lesson) => ({ lesson, teacher: nameOf(data, lesson.teacherId), student: nameOf(data, lesson.studentId), hasPlan: Boolean(lessonPlanForLesson(data, lesson)) })),
    missingPlans: upcomingWeek.filter((lesson) => !lessonPlanForLesson(data, lesson)).map((lesson) => ({ lesson, teacher: nameOf(data, lesson.teacherId), student: nameOf(data, lesson.studentId) })),
    team,
    atRisk: team.filter((row) => row.performance.tier === "Fair" || row.performance.tier === "At risk"),
  };
}

export default function ManagerOverview({ user, pendingApprovals, onNavigate }: {
  user: SchoolUser;
  pendingApprovals: number;
  onNavigate: (page: string) => void;
}) {
  const select = useCallback((data: SchoolData) => selectOverview(data, user), [user]);
  const view = useSchool(select);
  const isAdmin = user.role === "admin";
  const completedToday = view.todays.filter((row) => row.lesson.status === "completed").length;
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase();

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{dateLabel}</p>
        <h1>Good to see you, {firstName(user.name)}</h1>
        <p className="subheading">{isAdmin ? "Here's what's happening across the whole school today." : "Here's how your team is doing today."}</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Teachers")}><Icon name="users" size={15} /> Teachers</button>
        <button type="button" className="primary-button" onClick={() => onNavigate("Approvals")}><Icon name="check" size={15} /> Review approvals{pendingApprovals > 0 ? ` (${pendingApprovals})` : ""}</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="users" /></span><div><span>TEACHERS</span><strong>{view.teachers.length}</strong><small className="manager-card-note">{isAdmin ? `across ${view.managerCount} managers` : "on your team"}</small></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="user" /></span><div><span>ACTIVE STUDENTS</span><strong>{view.activeStudents}</strong><small className="manager-card-note">{view.students.length} total</small></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="calendar" /></span><div><span>LESSONS TODAY</span><strong>{view.todays.length}</strong><small className="manager-card-note">{completedToday} completed</small></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="check" /></span><div><span>PENDING APPROVALS</span><strong>{pendingApprovals}</strong><small className="manager-card-note">{pendingApprovals ? "waiting for you" : "all clear"}</small></div></article>
    </section>

    <div className="manager-overview-grid">
      <section className="panel student-panel">
        <div className="panel-header"><div><h2>{isAdmin ? "Teachers" : "Your team"}</h2><p>Lowest performance score first</p></div><button type="button" className="text-button" onClick={() => onNavigate("Teachers")}>All teachers <Icon name="arrow" size={14} /></button></div>
        <div className="manager-list">
          {view.team.map((row) => <button type="button" className="manager-list-row" key={row.teacher.id} onClick={() => onNavigate("Teachers")}>
            <PersonAvatar name={row.teacher.name} color={row.teacher.avatarColor} />
            <div className="manager-list-copy">
              <strong>{row.teacher.name}</strong>
              <small>{isAdmin ? `${row.managerName} · ` : ""}{row.studentCount} student{row.studentCount === 1 ? "" : "s"} · {row.next ? `Next: ${formatLessonDate(row.next.date)} ${row.next.time} with ${row.nextStudent}` : "No upcoming lessons"}</small>
            </div>
            <ScorePill performance={row.performance} />
          </button>)}
          {view.team.length === 0 && <div className="student-empty-inline"><Icon name="users" /><p>No teachers are assigned to you yet.</p></div>}
        </div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Today&apos;s lessons</h2><p>{view.todays.length ? `${view.todays.length} lesson${view.todays.length === 1 ? "" : "s"} across ${isAdmin ? "the school" : "your team"}` : "Nothing scheduled today"}</p></div></div>
        <div className="manager-list">
          {view.todays.map(({ lesson, teacher, student, hasPlan }) => <div className="manager-list-row static" key={lesson.id}>
            <div className="manager-time"><strong>{lesson.time}</strong><span>{lesson.endTime}</span></div>
            <div className="manager-list-copy">
              <strong>{lesson.title}</strong>
              <small>{teacher} → {student}{hasPlan ? "" : " · no lesson plan"}</small>
            </div>
            <LessonStatusBadge status={lesson.status} />
          </div>)}
          {view.todays.length === 0 && <div className="student-empty-inline"><Icon name="calendar" /><p>No lessons today.</p></div>}
        </div>
      </section>
    </div>

    <section className="panel student-panel">
      <div className="panel-header"><div><h2>Needs attention</h2><p>Things to sort out this week</p></div></div>
      <div className="manager-attention-grid">
        <button type="button" className="manager-attention-card" onClick={() => onNavigate("Approvals")}>
          <span className="metric-icon orange"><Icon name="check" /></span>
          <div><strong>{pendingApprovals} pending approval{pendingApprovals === 1 ? "" : "s"}</strong><small>Slot closures and cancellations from teachers</small></div>
        </button>
        <button type="button" className="manager-attention-card" onClick={() => onNavigate("Curriculum")}>
          <span className="metric-icon violet"><Icon name="file" /></span>
          <div><strong>{view.missingPlans.length} lesson{view.missingPlans.length === 1 ? "" : "s"} without a plan</strong><small>{view.missingPlans.length ? view.missingPlans.slice(0, 2).map((row) => `${row.lesson.title} (${row.teacher})`).join(", ") : "Every lesson this week has a plan"}</small></div>
        </button>
        <button type="button" className="manager-attention-card" onClick={() => onNavigate("Teachers")}>
          <span className="metric-icon blue"><Icon name="chart" /></span>
          <div><strong>{view.atRisk.length} teacher{view.atRisk.length === 1 ? "" : "s"} below Good</strong><small>{view.atRisk.length ? view.atRisk.map((row) => `${row.teacher.name} (${row.performance.score})`).join(", ") : "Everyone is scoring Good or better"}</small></div>
        </button>
      </div>
    </section>
  </div>;
}
