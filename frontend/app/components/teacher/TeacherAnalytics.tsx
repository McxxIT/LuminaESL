"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Icon from "../Icon";
import { useSchool } from "../../lib/hooks/useSchool";
import { performanceRules } from "../../lib/school";
import { downloadTextFile, formatLessonDate, isoDaysFromNow } from "../../lib/student";
import {
  computeTeacherPerformance,
  formatPoints,
  ON_THE_SPOT_CANCELLATION_POINTS,
  PERFORMANCE_BASE_POINTS,
  RATING_POINTS,
  TEACHER_ABSENCE_POINTS,
  type PerformanceEvent,
} from "../../lib/teacherPerformance";
import type { TeacherLesson } from "../../lib/types";

type AnalyticsProps = {
  lessons: TeacherLesson[];
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const eventIcon: Record<PerformanceEvent["kind"], "x" | "user" | "star"> = {
  "on-the-spot-cancellation": "x",
  absence: "user",
  rating: "star",
};

type HistoryFilter = "all" | "deductions" | "ratings";

function pointsTone(points: number) {
  if (points > 0) return "positive";
  if (points < 0) return "negative";
  return "neutral";
}

function Stars({ score, size = 13 }: { score: number; size?: number }) {
  return <span className="teacher-stars" aria-label={`${score.toFixed(1)} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= Math.round(score) ? "filled" : ""}><Icon name="star" size={size} /></span>)}
  </span>;
}

export default function TeacherAnalytics({ lessons, onNavigate, onNotice }: AnalyticsProps) {
  // Scoring rules come from the admin's School settings (on-the-spot window, performance window).
  const rules = useSchool(performanceRules);
  const performance = useMemo(() => computeTeacherPerformance(lessons, rules), [lessons, rules]);
  const { score, tier, events, onTheSpotCancellations, absences, ratings } = performance;
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const deductions = events.filter((event) => event.kind !== "rating");
  const visibleEvents = historyFilter === "all" ? events : historyFilter === "deductions" ? deductions : ratings.items;
  const historyTabs: { key: HistoryFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: events.length },
    { key: "deductions", label: "Deductions", count: deductions.length },
    { key: "ratings", label: "Ratings", count: ratings.items.length },
  ];

  const since = isoDaysFromNow(-rules.windowDays);
  const windowCompleted = lessons.filter((lesson) => lesson.status === "completed" && lesson.date >= since);
  const hoursTaught = windowCompleted.reduce((total, lesson) => total + lesson.duration / 60, 0);
  const attendanceLessons = windowCompleted.filter((lesson) => lesson.attendance);
  const attendanceRate = attendanceLessons.length
    ? Math.round((attendanceLessons.filter((lesson) => lesson.attendance === "attended").length / attendanceLessons.length) * 100)
    : 0;
  const ratingComments = ratings.items.filter((event) => event.rating?.comment).slice(0, 4);
  const maxDistribution = Math.max(...Object.values(ratings.distribution), 1);
  const tierClass = tier.toLowerCase().replace(" ", "-");

  function downloadReport() {
    const lines = [
      "LUMINA ESL — TEACHER PERFORMANCE",
      "================================",
      `Window: last ${rules.windowDays} days`,
      `Performance score: ${score}/100 (${tier})`,
      `On-the-spot cancellations: ${onTheSpotCancellations.count} (${formatPoints(onTheSpotCancellations.points)} pts)`,
      `Absent while student present: ${absences.count} (${formatPoints(absences.points)} pts)`,
      `Ratings: ${ratings.count} · average ${ratings.average.toFixed(1)}/5 (${formatPoints(ratings.points)} pts)`,
      "",
      `Hours taught: ${hoursTaught.toFixed(1)}`,
      `Lessons completed: ${windowCompleted.length}`,
      `Student attendance: ${attendanceRate}%`,
      "",
      "POINTS HISTORY",
      ...(events.length ? events.map((event) => `${event.date} ${event.time} · ${formatPoints(event.points)} · ${event.title} · ${event.detail}`) : ["No point changes in this window."]),
    ];
    downloadTextFile("lumina-teacher-performance.txt", lines.join("\n"));
    onNotice("Performance report downloaded.");
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">TEACHING ANALYTICS</p><h1>Your performance</h1><p className="subheading">Points from cancellations, attendance, and student &amp; parent ratings over the last {rules.windowDays} days.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={downloadReport}><Icon name="download" size={15} /> Download report</button>
      </div>
    </section>

    <section className="panel teacher-score-panel">
      <div className={`teacher-score-ring tier-${tierClass}`} style={{ "--score": score } as CSSProperties}>
        <div><strong>{score}</strong><span>/ 100</span></div>
      </div>
      <div className="teacher-score-copy">
        <span className="eyebrow">PERFORMANCE SCORE</span>
        <h2><span className={`teacher-tier-pill tier-${tierClass}`}>{tier}</span></h2>
        <p>You start each {rules.windowDays}-day window at {PERFORMANCE_BASE_POINTS} points. Late cancellations and missed lessons take points away; student and parent ratings add or remove them.</p>
      </div>
      <div className="teacher-score-breakdown">
        <div>
          <span className="metric-icon orange"><Icon name="x" /></span>
          <span className="teacher-score-label">On-the-spot cancellations<small>{onTheSpotCancellations.count} in the last {rules.windowDays} days</small></span>
          <em className={`teacher-points ${pointsTone(onTheSpotCancellations.points)}`}>{formatPoints(onTheSpotCancellations.points)}</em>
        </div>
        <div>
          <span className="metric-icon violet"><Icon name="user" /></span>
          <span className="teacher-score-label">Absent, student present<small>{absences.count} in the last {rules.windowDays} days</small></span>
          <em className={`teacher-points ${pointsTone(absences.points)}`}>{formatPoints(absences.points)}</em>
        </div>
        <div>
          <span className="metric-icon green"><Icon name="star" /></span>
          <span className="teacher-score-label">Student &amp; parent ratings<small>{ratings.count ? `${ratings.average.toFixed(1)} average · ${ratings.count} ratings` : "No ratings yet"}</small></span>
          <em className={`teacher-points ${pointsTone(ratings.points)}`}>{formatPoints(ratings.points)}</em>
        </div>
      </div>
    </section>

    <div className="teacher-analytics-columns">
      <section className="panel student-panel teacher-history-panel">
        <div className="panel-header"><div><h2>Points history</h2><p>Every change to your score, newest first</p></div></div>
        <div className="student-tabbar" role="tablist" aria-label="Filter points history">
          {historyTabs.map((item) => <button type="button" role="tab" aria-selected={historyFilter === item.key} className={`student-tab ${historyFilter === item.key ? "active" : ""}`} key={item.key} onClick={() => setHistoryFilter(item.key)}>
            {item.label}<span>{item.count}</span>
          </button>)}
        </div>
        <div className="teacher-points-list">
          {visibleEvents.length > 0 ? visibleEvents.map((event) => <div className="teacher-points-row" key={event.id}>
            <span className={`teacher-points-icon ${pointsTone(event.points)}`}><Icon name={eventIcon[event.kind]} size={15} /></span>
            <div className="teacher-points-copy">
              <strong>{event.title}</strong>
              <small>{formatLessonDate(event.date)} · {event.time} · {event.detail}</small>
            </div>
            <em className={`teacher-points ${pointsTone(event.points)}`}>{formatPoints(event.points)}</em>
          </div>) : <div className="student-empty-inline"><Icon name="check" /><p>{historyFilter === "deductions" ? "No deductions in the last" : historyFilter === "ratings" ? "No ratings in the last" : "No point changes in the last"} {rules.windowDays} days.</p></div>}
        </div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Ratings</h2><p>From students and parents after each lesson</p></div></div>
        <div className="teacher-ratings">
          <div className="teacher-ratings-summary">
            <div className="teacher-ratings-average">
              <strong>{ratings.count ? ratings.average.toFixed(1) : "—"}</strong>
              <Stars score={ratings.average} size={15} />
              <small>{ratings.count} rating{ratings.count === 1 ? "" : "s"}</small>
            </div>
            <div className="teacher-ratings-bars">
              {([5, 4, 3, 2, 1] as const).map((star) => <div key={star}>
                <span>{star}★</span>
                <div className="bar"><i style={{ width: `${(ratings.distribution[star] / maxDistribution) * 100}%` }} /></div>
                <em>{ratings.distribution[star]}</em>
              </div>)}
            </div>
          </div>
          <div className="teacher-ratings-comments">
            {ratingComments.length > 0 ? ratingComments.map((event) => <blockquote key={event.id}>
              <div><Stars score={event.rating!.score} size={11} /><span className={`teacher-rating-source ${event.rating!.from}`}>{event.rating!.from}</span></div>
              <p>&ldquo;{event.rating!.comment}&rdquo;</p>
              <small>{event.rating!.name} · {formatLessonDate(event.date)}</small>
            </blockquote>) : <div className="student-empty-inline"><Icon name="message" /><p>Written feedback from students and parents will appear here.</p></div>}
          </div>
        </div>
      </section>
    </div>

    <section className="panel student-panel teacher-points-rules">
      <div className="panel-header"><div><h2>How points work</h2><p>Applied to lessons in the last {rules.windowDays} days · score stays between 0 and 100</p></div></div>
      <div className="teacher-rules-grid">
        <div><em className="teacher-points negative">{ON_THE_SPOT_CANCELLATION_POINTS}</em><span>Cancelling less than {rules.onTheSpotHours} hours before the start (once approved)</span></div>
        <div><em className="teacher-points negative">{TEACHER_ABSENCE_POINTS}</em><span>Missing a lesson the student attended</span></div>
        <div><em className="teacher-points positive">{formatPoints(RATING_POINTS[5])} / {formatPoints(RATING_POINTS[4])}</em><span>5★ / 4★ rating from a student or parent</span></div>
        <div><em className="teacher-points negative">{RATING_POINTS[2]} / {RATING_POINTS[1]}</em><span>2★ / 1★ rating · 3★ has no effect</span></div>
      </div>
    </section>

    <section className="student-footer-strip">
      <div><span className="eyebrow">HOURS TAUGHT · {rules.windowDays} DAYS</span><strong>{hoursTaught.toFixed(1)} hrs</strong></div>
      <div><span className="eyebrow">LESSONS COMPLETED</span><strong>{windowCompleted.length}</strong></div>
      <div><span className="eyebrow">STUDENT ATTENDANCE</span><strong>{attendanceRate}%</strong></div>
      <button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Review lessons <Icon name="arrow" size={14} /></button>
    </section>
  </div>;
}
