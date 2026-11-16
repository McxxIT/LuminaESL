"use client";

import { useCallback, useState } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { PersonAvatar, ScorePill } from "./parts";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  lessonsForTeacher,
  managerIdForTeacher,
  nameOf,
  performanceForTeacher,
  performanceRules,
  teachersForUser,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { formatPoints } from "../../lib/teacherPerformance";
import { formatLessonDate, isoDaysFromNow } from "../../lib/student";

function selectPerformance(data: SchoolData, user: SchoolUser) {
  const rules = performanceRules(data);
  const since = isoDaysFromNow(-rules.windowDays);
  const today = isoDaysFromNow(0);
  const rows = teachersForUser(data, user).map((teacher) => {
    const performance = performanceForTeacher(data, teacher.id);
    const taught = lessonsForTeacher(data, teacher.id).filter((lesson) => lesson.status === "completed" && lesson.date >= since && lesson.date <= today).length;
    return { teacher, managerName: nameOf(data, managerIdForTeacher(data, teacher.id), "Unassigned"), performance, taught };
  }).sort((a, b) => b.performance.score - a.performance.score || a.teacher.name.localeCompare(b.teacher.name));
  const ratingItems = rows.flatMap((row) => row.performance.ratings.items);
  return {
    rules,
    rows,
    averageScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.performance.score, 0) / rows.length) : 0,
    averageRating: ratingItems.length ? ratingItems.reduce((sum, item) => sum + (item.rating?.score ?? 0), 0) / ratingItems.length : 0,
    ratingCount: ratingItems.length,
    cancellations: rows.reduce((sum, row) => sum + row.performance.onTheSpotCancellations.count, 0),
    absences: rows.reduce((sum, row) => sum + row.performance.absences.count, 0),
  };
}

type Row = ReturnType<typeof selectPerformance>["rows"][number];

function Stars({ value }: { value: number }) {
  return <span className="teacher-stars" aria-label={`${value.toFixed(1)} out of 5`}>{[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= Math.round(value) ? "filled" : ""}><Icon name="star" size={12} /></span>)}</span>;
}

export default function ManagerPerformance({ user }: { user: SchoolUser }) {
  const select = useCallback((data: SchoolData) => selectPerformance(data, user), [user]);
  const view = useSchool(select);
  const [selected, setSelected] = useState<Row | null>(null);
  const isAdmin = user.role === "admin";
  const current = selected ? view.rows.find((row) => row.teacher.id === selected.teacher.id) ?? selected : null;

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">{isAdmin ? "SCHOOL QUALITY" : "TEAM QUALITY"}</p>
        <h1>Performance</h1>
        <p className="subheading">Scores cover the last {view.rules.windowDays} days. Cancelling less than {view.rules.onTheSpotHours} hour{view.rules.onTheSpotHours === 1 ? "" : "s"} before a lesson counts as on-the-spot{isAdmin ? " (change both in School settings)" : ""}.</p>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="chart" /></span><div><span>AVERAGE SCORE</span><strong>{view.averageScore}<em> / 100</em></strong><small className="manager-card-note">{view.rows.length} teacher{view.rows.length === 1 ? "" : "s"}</small></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="star" /></span><div><span>AVERAGE RATING</span><strong>{view.ratingCount ? view.averageRating.toFixed(1) : "—"}<em> / 5</em></strong><small className="manager-card-note">{view.ratingCount} rating{view.ratingCount === 1 ? "" : "s"}</small></div></article>
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="x" /></span><div><span>ON-THE-SPOT CANCELLATIONS</span><strong>{view.cancellations}</strong><small className="manager-card-note">-10 points each</small></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="user" /></span><div><span>ABSENCES</span><strong>{view.absences}</strong><small className="manager-card-note">-20 points each</small></div></article>
    </section>

    <section className="panel student-panel">
      <div className="panel-header"><div><h2>Leaderboard</h2><p>Highest score first · click a teacher for their points history</p></div></div>
      <div className="manager-table" role="table" aria-label="Teacher performance">
        <div className={`manager-table-head perf ${isAdmin ? "with-manager" : ""}`} role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Teacher</span>
          {isAdmin && <span role="columnheader">Manager</span>}
          <span role="columnheader">Score</span>
          <span role="columnheader">Rating</span>
          <span role="columnheader">On-the-spot</span>
          <span role="columnheader">Absences</span>
          <span role="columnheader">Taught</span>
        </div>
        {view.rows.map((row, index) => <button type="button" role="row" className={`manager-table-row perf ${isAdmin ? "with-manager" : ""}`} key={row.teacher.id} onClick={() => setSelected(row)}>
          <span role="cell" className="perf-rank">{index + 1}</span>
          <span className="manager-person" role="cell"><PersonAvatar name={row.teacher.name} color={row.teacher.avatarColor} /><span><strong>{row.teacher.name}</strong><small>{row.teacher.status === "active" ? row.teacher.email : "Paused"}</small></span></span>
          {isAdmin && <span role="cell" className="manager-cell" data-label="Manager">{row.managerName}</span>}
          <span role="cell" className="manager-cell" data-label="Score"><ScorePill performance={row.performance} /></span>
          <span role="cell" className="manager-cell" data-label="Rating">{row.performance.ratings.count ? <><Stars value={row.performance.ratings.average} /> <small className="perf-sub">{row.performance.ratings.average.toFixed(1)} · {row.performance.ratings.count}</small></> : <small className="perf-sub">No ratings</small>}</span>
          <span role="cell" className={`manager-cell ${row.performance.onTheSpotCancellations.count ? "manager-low" : ""}`} data-label="On-the-spot">{row.performance.onTheSpotCancellations.count}</span>
          <span role="cell" className={`manager-cell ${row.performance.absences.count ? "manager-low" : ""}`} data-label="Absences">{row.performance.absences.count}</span>
          <span role="cell" className="manager-cell" data-label="Taught">{row.taught} lesson{row.taught === 1 ? "" : "s"}</span>
        </button>)}
        {view.rows.length === 0 && <div className="student-empty-inline"><Icon name="chart" /><p>No teachers to compare yet.</p></div>}
      </div>
    </section>

    {current && <Modal eyebrow="PERFORMANCE" title={current.teacher.name} description={`Last ${view.rules.windowDays} days · ${current.taught} lessons taught`} onClose={() => setSelected(null)} size="wide"
      footer={<button type="button" className="cancel-button" onClick={() => setSelected(null)}>Close</button>}>
      <div className="manager-detail-stats">
        <div><span className="eyebrow">SCORE</span><ScorePill performance={current.performance} /></div>
        <div><span className="eyebrow">RATINGS</span><strong>{current.performance.ratings.count ? `${current.performance.ratings.average.toFixed(1)} ★ (${formatPoints(current.performance.ratings.points)})` : "None"}</strong></div>
        <div><span className="eyebrow">ON-THE-SPOT</span><strong>{current.performance.onTheSpotCancellations.count} ({formatPoints(current.performance.onTheSpotCancellations.points)})</strong></div>
        <div><span className="eyebrow">ABSENCES</span><strong>{current.performance.absences.count} ({formatPoints(current.performance.absences.points)})</strong></div>
      </div>
      <div className="lesson-detail-section">
        <span className="eyebrow">POINTS HISTORY</span>
        <div className="perf-history">
          {current.performance.events.map((event) => <div className="teacher-points-row" key={event.id}>
            <span className={`teacher-points-icon ${event.points > 0 ? "positive" : event.points < 0 ? "negative" : "neutral"}`}><Icon name={event.kind === "rating" ? "star" : event.kind === "absence" ? "user" : "x"} size={15} /></span>
            <div className="teacher-points-copy"><strong>{event.title}</strong><small>{formatLessonDate(event.date)} · {event.time} · {event.detail}</small>{event.rating?.comment && <small>&ldquo;{event.rating.comment}&rdquo;</small>}</div>
            <em className={`teacher-points ${event.points > 0 ? "positive" : event.points < 0 ? "negative" : "neutral"}`}>{formatPoints(event.points)}</em>
          </div>)}
          {current.performance.events.length === 0 && <p className="manager-help">No point changes in this window. The teacher keeps 100 points.</p>}
        </div>
      </div>
    </Modal>}
  </div>;
}
