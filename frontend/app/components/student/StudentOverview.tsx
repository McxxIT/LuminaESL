"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { studyTasks } from "../../lib/data";
import { canJoinLesson } from "../../lib/scheduling";
import { formatLessonDate, parseISODate } from "../../lib/student";
import type {
  PracticeResult,
  StudentAssignment,
  StudentLesson,
  StudentProfile,
  StudentSkill,
} from "../../lib/types";

type OverviewProps = {
  profile: StudentProfile;
  lessons: StudentLesson[];
  creditHours: number;
  /** Real progress through the student's course (shared store). */
  courseProgress?: { courseTitle: string; completed: number; total: number; nextPlanTitle?: string };
  assignments: StudentAssignment[];
  skills: StudentSkill[];
  completedTasks: string[];
  practiceResults: PracticeResult[];
  onToggleTask: (task: string) => void;
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

function lessonTimestamp(lesson: StudentLesson) {
  return parseISODate(lesson.date).getTime() + Number(lesson.time.split(":")[0]) * 3_600_000 + Number(lesson.time.split(":")[1]) * 60_000;
}

function useCountdown(target: number) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    const update = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    const start = window.setTimeout(() => {
      update();
      timer = window.setInterval(update, 1000);
    }, 0);
    return () => {
      window.clearTimeout(start);
      if (timer) window.clearInterval(timer);
    };
  }, [target]);

  return {
    hours: Math.floor(remaining / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    seconds: remaining % 60,
    remaining,
  };
}

export default function StudentOverview({
  profile,
  lessons,
  creditHours,
  courseProgress,
  assignments,
  skills,
  completedTasks,
  practiceResults,
  onToggleTask,
  onNavigate,
  onNotice,
}: OverviewProps) {
  const upcoming = useMemo(
    () => lessons
      .filter((lesson) => canJoinLesson(lesson))
      .sort((a, b) => lessonTimestamp(a) - lessonTimestamp(b)),
    [lessons],
  );
  const nextLesson = upcoming[0];
  const countdown = useCountdown(nextLesson ? lessonTimestamp(nextLesson) : 0);
  const completed = lessons.filter((lesson) => lesson.status === "completed");
  const latestFeedback = completed[0];
  const pendingAssignments = assignments.filter((assignment) => assignment.status === "pending");
  const averageProgress = Math.round(skills.reduce((total, skill) => total + skill.value, 0) / skills.length);
  const practiceMinutes = practiceResults.reduce((total, result) => total + result.minutes, 0);
  const completedTaskCount = studyTasks.filter((task) => completedTasks.includes(task)).length;

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">STUDENT WORKSPACE</p>
        <h1>Good to see you, {profile.name.split(" ")[0]} <span>✦</span></h1>
        <p className="subheading">Your next lesson, practice goals, and feedback are all in one place.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNavigate("Lessons")}><Icon name="calendarAdd" size={16} /> Book session</button>
        <button type="button" className="primary-button" onClick={() => onNavigate("Practice")}>Practice now <Icon name="arrow" size={16} /></button>
      </div>
    </section>

    <section className="student-hero" aria-label="Next lesson">
      <div className="student-hero-glow" aria-hidden="true" />
      <div className="student-hero-copy">
        <div className="student-hero-meta">
          <span className="student-live-chip"><i /> {nextLesson?.status === "upcoming" ? "CONFIRMED" : "NO LESSON"} {nextLesson?.roomCode ? `· ROOM ${nextLesson.roomCode}` : ""}</span>
          {nextLesson && <span>{formatLessonDate(nextLesson.date)} · {nextLesson.time}–{nextLesson.endTime}</span>}
        </div>
        <h2>{nextLesson?.title ?? "Book your next lesson"}</h2>
        {nextLesson ? <div className="student-hero-tutor">
          <div className={`avatar avatar-${nextLesson.tutorColor}`}>{nextLesson.tutorInitials}</div>
          <div><strong>{nextLesson.tutor}</strong><small>{nextLesson.focus.join(" · ")}</small></div>
        </div> : <p className="student-hero-empty">Choose a tutor and time that works for your week.</p>}
        <div className="student-hero-actions">
          <button type="button" className="hero-primary" onClick={() => nextLesson ? onNotice(`Classroom ${nextLesson.roomCode} opens 5 minutes before the lesson.`) : onNavigate("Lessons")}>
            <Icon name="video" size={18} /> {nextLesson ? "Join live classroom" : "Find a lesson"}
          </button>
          {nextLesson && <>
            <button type="button" className="hero-secondary" onClick={() => onNavigate("Practice")}><Icon name="book" size={16} /> Pre-lesson prep</button>
            <button type="button" className="hero-link" onClick={() => onNavigate("Lessons")}>Reschedule / cancel</button>
          </>}
        </div>
      </div>
      <div className="student-hero-timer">
        <div className="timer-card">
          <div className="timer-card-head">
            <span>CLASSROOM OPENS IN</span>
            <span className="timer-online"><i /> WebRTC online</span>
          </div>
          <div className="countdown-grid">
            <div><strong>{String(countdown.hours).padStart(2, "0")}</strong><span>Hours</span></div>
            <div><strong>{String(countdown.minutes).padStart(2, "0")}</strong><span>Minutes</span></div>
            <div><strong className="seconds">{String(countdown.seconds).padStart(2, "0")}</strong><span>Seconds</span></div>
          </div>
          <div className="timer-foot">
            <span><Icon name="mic" size={14} /> Audio / video ready</span>
            <button type="button" onClick={() => onNotice("Device check complete. Camera and microphone are ready.")}>Test device</button>
          </div>
        </div>
      </div>
    </section>

    <section className="student-metrics">
      <article className="role-card"><div className="metric-icon blue"><Icon name="calendar" /></div><div><span>NEXT LESSON</span><strong>{nextLesson ? `${formatLessonDate(nextLesson.date)}, ${nextLesson.time}` : "Not booked"}</strong><small>{nextLesson?.title ?? "Book a session to get started"}</small></div></article>
      <article className="role-card"><div className="metric-icon green"><Icon name="chart" /></div><div><span>COURSE PROGRESS</span><strong>{courseProgress ? <>{courseProgress.completed} <em>/ {courseProgress.total} lessons</em></> : "Not enrolled"}</strong><small>{courseProgress ? courseProgress.courseTitle : "Ask your school to enroll you"}</small>{courseProgress && courseProgress.total > 0 && <div className="bar course-progress-bar"><i style={{ width: `${Math.round((courseProgress.completed / courseProgress.total) * 100)}%` }} /></div>}</div></article>
      <article className="role-card"><div className="metric-icon violet"><Icon name="zap" /></div><div><span>LEARNING STREAK</span><strong>12 days</strong><small>{practiceMinutes} practice minutes logged</small></div></article>
      <article className="role-card"><div className="metric-icon orange"><Icon name="clock" /></div><div><span>LESSON CREDITS</span><strong>{creditHours.toFixed(1)} <em>hrs</em></strong><small>About {Math.floor(creditHours)} 25-minute lessons</small></div></article>
    </section>

    <div className="student-dashboard-grid">
      <div className="student-dashboard-main">
        <section className="panel student-panel">
          <div className="panel-header">
            <div><h2>This week</h2><p>Your upcoming sessions in local time</p></div>
            <button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Full schedule <Icon name="arrow" size={14} /></button>
          </div>
          <div className="student-week-list">
            {upcoming.slice(0, 4).map((lesson) => <button type="button" className="student-week-row" key={lesson.id} onClick={() => onNavigate("Lessons")}>
              <div className={`avatar avatar-${lesson.tutorColor}`}>{lesson.tutorInitials}</div>
              <div className="student-week-copy"><strong>{lesson.title}</strong><small>{lesson.tutor} · {lesson.focus.join(" · ")}</small></div>
              <div className="student-week-time"><strong>{formatLessonDate(lesson.date)}</strong><span>{lesson.time}–{lesson.endTime}</span></div>
              <Icon name="chevronRight" size={16} />
            </button>)}
            {upcoming.length === 0 && <div className="student-empty-inline"><Icon name="calendar" /><p>No lessons scheduled. Book a session to get started.</p><button type="button" className="primary-button" onClick={() => onNavigate("Lessons")}>Book a lesson</button></div>}
          </div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header">
            <div><h2>Assignments due</h2><p>{pendingAssignments.length} task{pendingAssignments.length === 1 ? "" : "s"} waiting for you</p></div>
            <button type="button" className="text-button" onClick={() => onNavigate("Assignments")}>View all <Icon name="arrow" size={14} /></button>
          </div>
          <div className="student-assignment-preview">
            {pendingAssignments.slice(0, 3).map((assignment) => <button type="button" className="student-assignment-row" key={assignment.id} onClick={() => onNavigate("Assignments")}>
              <span className={`assignment-type ${assignment.type}`}><Icon name={assignment.type === "recording" ? "mic" : assignment.type === "quiz" ? "check" : assignment.type === "reading" ? "book" : "edit"} size={16} /></span>
              <span className="student-assignment-copy"><strong>{assignment.title}</strong><small>{assignment.tutor} · {assignment.description}</small></span>
              <span className="student-due-pill">{assignment.dueLabel}</span>
              <Icon name="chevronRight" size={16} />
            </button>)}
            {pendingAssignments.length === 0 && <div className="student-empty-inline"><Icon name="check" /><p>You are all caught up on assignments.</p></div>}
          </div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header">
            <div><h2>Keep learning</h2><p>{completedTaskCount} of {studyTasks.length} weekly actions completed</p></div>
            <button type="button" className="text-button" onClick={() => onNavigate("Practice")}>Practice library <Icon name="arrow" size={14} /></button>
          </div>
          <div className="task-list">
            {studyTasks.map((task) => {
              const done = completedTasks.includes(task);
              return <button type="button" className={`task-row ${done ? "completed" : ""}`} key={task} onClick={() => { onToggleTask(task); onNotice(`${task} ${done ? "reopened" : "completed"}.`); }}>
                <span className="task-check">{done ? "✓" : ""}</span>
                <span>{task}</span>
                <Icon name="arrow" size={14} />
              </button>;
            })}
          </div>
        </section>
      </div>

      <aside className="student-dashboard-side">
        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Progress snapshot</h2><p>{profile.currentLevel} → {profile.targetLevel}</p></div></div>
          <div className="student-progress-snapshot">
            <div className="student-progress-total"><strong>{averageProgress}%</strong><span>overall mastery</span></div>
            {skills.map((skill) => <div className="student-mini-skill" key={skill.key}>
              <div><span>{skill.label}</span><strong>{skill.value}%</strong></div>
              <div className="bar"><i className={skill.tone === "secondary" ? "secondary-bar" : skill.tone === "tertiary" ? "green-bar" : ""} style={{ width: `${skill.value}%` }} /></div>
            </div>)}
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Progress")}>View full progress <Icon name="arrow" size={14} /></button>
          </div>
        </section>

        <section className="panel student-panel feedback-panel">
          <div className="panel-header"><div><h2>Latest feedback</h2><p>{latestFeedback ? latestFeedback.title : "No feedback yet"}</p></div></div>
          {latestFeedback ? <div className="feedback-preview">
            <div className="feedback-quote"><Icon name="message" size={16} /><p>{latestFeedback.feedback}</p></div>
            <div className="feedback-scores">{latestFeedback.scores?.slice(0, 3).map((score) => <div key={score.label}><strong>{score.value.toFixed(1)}</strong><span>{score.label}</span></div>)}</div>
            <button type="button" className="secondary-button full-width" onClick={() => onNavigate("Progress")}>Open lesson report <Icon name="arrow" size={14} /></button>
          </div> : <div className="student-empty-inline"><Icon name="message" /><p>Complete your first lesson to receive tutor feedback.</p></div>}
        </section>

        <section className="panel student-panel student-streak-card">
          <div className="student-streak-icon"><Icon name="sparkles" size={22} /></div>
          <div><span className="eyebrow">WEEKLY GOAL</span><h2>{completedTaskCount}/{studyTasks.length} actions done</h2><p>You are building a steady routine. A little practice today keeps your streak alive.</p><button type="button" className="text-button" onClick={() => onNavigate("Practice")}>Start a 5-minute activity <Icon name="arrow" size={14} /></button></div>
        </section>

        <section className="panel student-panel">
          <div className="panel-header"><div><h2>Weekly tip</h2><p>From your tutor team</p></div></div>
          <div className="student-tip"><span className="metric-icon orange"><Icon name="mic" /></span><div><strong>Speak out loud, even alone.</strong><p>Record two minutes of free speaking before your next lesson. It makes pronunciation patterns easier to notice.</p></div></div>
        </section>
      </aside>
    </div>

    <section className="student-footer-strip">
      <div><span className="eyebrow">CURRENT GOAL</span><strong>{profile.learningGoal}</strong></div>
      <div><span className="eyebrow">WEEKLY TARGET</span><strong>{profile.weeklyGoal} lessons</strong></div>
      <div><span className="eyebrow">NEXT CHECKPOINT</span><strong>{profile.targetLevel}</strong></div>
      <button type="button" className="text-button" onClick={() => onNavigate("Profile")}>Update learning goals <Icon name="arrow" size={14} /></button>
    </section>
  </div>;
}
