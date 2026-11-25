"use client";

import { useMemo, useState } from "react";
import Icon, { type IconName } from "../Icon";
import { downloadTextFile } from "../../lib/student";
import type { PracticeResult, StudentAchievement, StudentLesson, StudentProfile, StudentSkill } from "../../lib/types";

type ProgressProps = {
  profile: StudentProfile;
  skills: StudentSkill[];
  achievements: StudentAchievement[];
  lessons: StudentLesson[];
  practiceResults: PracticeResult[];
  onNavigate: (page: string) => void;
  onNotice: (message: string) => void;
};

const ranges = {
  "4 weeks": [38, 52, 31, 64, 48, 72, 44],
  "8 weeks": [26, 41, 55, 49, 68, 73, 61],
  "12 weeks": [18, 32, 45, 54, 63, 71, 69],
};

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StudentProgress({ profile, skills, achievements, lessons, practiceResults, onNavigate, onNotice }: ProgressProps) {
  const [range, setRange] = useState<keyof typeof ranges>("4 weeks");
  const completed = useMemo(() => lessons.filter((lesson) => lesson.status === "completed"), [lessons]);
  const latest = completed[0];
  const average = Math.round(skills.reduce((total, skill) => total + skill.value, 0) / skills.length);
  const weakest = [...skills].sort((a, b) => a.value - b.value)[0];
  const practiceMinutes = practiceResults.reduce((total, result) => total + result.minutes, 0);
  const chartMax = Math.max(...ranges[range]);

  function downloadReport() {
    const lines = [
      "LUMINA ESL — PROGRESS REPORT",
      "============================",
      `Student: ${profile.name}`,
      `Current level: ${profile.currentLevel}`,
      `Target level: ${profile.targetLevel}`,
      `Learning goal: ${profile.learningGoal}`,
      `Overall mastery: ${average}%`,
      "",
      "SKILL BREAKDOWN",
      ...skills.map((skill) => `${skill.label}: ${skill.value}% — ${skill.note}`),
      "",
      "RECENT ACHIEVEMENTS",
      ...achievements.filter((item) => item.unlocked).map((item) => `${item.title}: ${item.detail}`),
      "",
      "RECENT LESSON FEEDBACK",
      latest?.feedback ?? "No feedback recorded yet.",
      "",
      `Practice minutes logged in this workspace: ${practiceMinutes}`,
    ];
    downloadTextFile(`lumina-progress-${profile.name.toLowerCase().replaceAll(" ", "-")}.txt`, lines.join("\n"));
    onNotice("Progress report downloaded.");
  }

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">MY PROGRESS</p><h1>See your growth</h1><p className="subheading">Track the skills you are building through lessons, practice, and tutor feedback.</p></div>
      <div className="page-heading-actions">
        <label className="student-select"><Icon name="calendar" size={15} /><select value={range} onChange={(event) => setRange(event.target.value as keyof typeof ranges)} aria-label="Report range">{Object.keys(ranges).map((item) => <option key={item}>{item}</option>)}</select></label>
        <button type="button" className="secondary-button" onClick={downloadReport}><Icon name="download" size={15} /> Download report</button>
      </div>
    </section>

    <section className="student-progress-hero">
      <article className="panel progress-hero student-level-card">
        <div>
          <span className="eyebrow">OVERALL LEVEL</span>
          <strong>{profile.currentLevel.split(" ")[0]} <em>{profile.currentLevel.split(" ").slice(1).join(" ")}</em></strong>
          <p>You are making steady progress. Keep practising speaking and writing to reach {profile.targetLevel}.</p>
          <div className="level-roadmap"><span>B1</span><div className="bar"><i style={{ width: `${average}%` }} /></div><span>B2</span></div>
          <small>{average}% of the way to your target level</small>
        </div>
        <div className="level-ring" style={{ background: `conic-gradient(#4f46e5 ${average}%, #e2e8f0 ${average}% 100%)` }}><span>{average}%</span></div>
      </article>
      <article className="panel student-goal-card">
        <div className="student-goal-head"><span className="metric-icon green"><Icon name="target" /></span><div><span className="eyebrow">TARGET GOAL</span><strong>{profile.learningGoal}</strong></div></div>
        <div className="student-goal-stats">
          <div><span>Weekly target</span><strong>{profile.weeklyGoal} lessons</strong></div>
          <div><span>Practice logged</span><strong>{practiceMinutes} min</strong></div>
          <div><span>Lessons completed</span><strong>{completed.length}</strong></div>
        </div>
        <button type="button" className="primary-button full-width" onClick={() => onNavigate("Practice")}>Practice {weakest.label.toLowerCase()} <Icon name="arrow" size={15} /></button>
      </article>
    </section>

    <section className="panel student-panel">
      <div className="panel-header"><div><h2>Skill breakdown</h2><p>Based on tutor evaluations and completed practice</p></div><button type="button" className="text-button" onClick={() => onNotice("Skill breakdown details opened.")}>How is this calculated? <Icon name="help" size={14} /></button></div>
      <div className="student-skill-grid">
        {skills.map((skill) => <article className="student-skill-card" key={skill.key}>
          <div className="student-skill-head"><span className={`skill-dot ${skill.tone}`} /><strong>{skill.label}</strong><em>{skill.value}%</em></div>
          <div className="bar"><i className={skill.tone === "secondary" ? "secondary-bar" : skill.tone === "tertiary" ? "green-bar" : ""} style={{ width: `${skill.value}%` }} /></div>
          <p>{skill.note}</p>
        </article>)}
      </div>
    </section>

    <div className="student-progress-columns">
      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Learning activity</h2><p>Practice minutes by day · {range}</p></div><span className="student-trend"><Icon name="chart" size={14} /> +12% vs previous</span></div>
        <div className="student-activity-chart">
          {ranges[range].map((value, index) => <div className="activity-bar-wrap" key={`${range}-${dayLabels[index]}`}>
            <span>{value}</span>
            <div className="activity-bar"><i style={{ height: `${Math.round((value / chartMax) * 100)}%` }} /></div>
            <small>{dayLabels[index]}</small>
          </div>)}
        </div>
      </section>

      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Recent achievements</h2><p>Milestones you have reached</p></div></div>
        <div className="student-achievement-grid">
          {achievements.map((achievement) => <article className={`student-achievement ${achievement.unlocked ? "" : "locked"}`} key={achievement.id}>
            <span className="achievement-icon"><Icon name={achievement.icon as IconName} size={16} /></span>
            <div><strong>{achievement.title}</strong><small>{achievement.detail}</small></div>
          </article>)}
        </div>
      </section>
    </div>

    <section className="panel student-panel">
      <div className="panel-header"><div><h2>Latest tutor report</h2><p>{latest ? `${latest.title} · ${latest.tutor}` : "Your first report will appear here"}</p></div>{latest && <button type="button" className="text-button" onClick={() => onNavigate("Lessons")}>Open in lessons <Icon name="arrow" size={14} /></button>}</div>
      {latest ? <div className="student-report-preview">
        <div className="student-report-scores">{latest.scores?.map((score) => <div key={score.label}><strong>{score.value.toFixed(1)}<em>/5</em></strong><span>{score.label}</span></div>)}</div>
        <blockquote>{latest.feedback}</blockquote>
        <div className="correction-list">{latest.corrections?.map((item) => <span key={item.from}><s>{item.from}</s> → <strong>{item.to}</strong></span>)}</div>
      </div> : <div className="student-empty-inline"><Icon name="file" /><p>Complete a lesson to receive a tutor report.</p></div>}
    </section>
  </div>;
}
