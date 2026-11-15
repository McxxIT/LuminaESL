"use client";

import { useMemo, useState } from "react";
import Icon from "../Icon";
import StudentModal from "./StudentModal";
import type { PracticeActivity, PracticeResult } from "../../lib/types";

type PracticeProps = {
  activities: PracticeActivity[];
  practiceResults: PracticeResult[];
  onCompletePractice: (activityId: string, score: number, total: number, minutes: number) => void;
  onNotice: (message: string) => void;
};

const categories = ["All", "Speaking", "Listening", "Vocabulary", "Grammar"] as const;

export default function StudentPractice({ activities, practiceResults, onCompletePractice, onNotice }: PracticeProps) {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [session, setSession] = useState<PracticeActivity | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const filtered = useMemo(() => activities.filter((activity) => category === "All" || activity.category === category), [activities, category]);
  const totalMinutes = practiceResults.reduce((total, result) => total + result.minutes, 0);
  const totalQuestions = practiceResults.reduce((total, result) => total + result.total, 0);
  const totalCorrect = practiceResults.reduce((total, result) => total + result.score, 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const recent = [...practiceResults].reverse().slice(0, 3);

  function openSession(activity: PracticeActivity) {
    setSession(activity);
    setQuestionIndex(0);
    setSelected(null);
    setChecked(false);
    setScore(0);
    setFinished(false);
    setRecorded(false);
  }

  function closeSession() {
    setSession(null);
  }

  function checkAnswer() {
    if (!session || selected === null) return;
    setChecked(true);
    if (selected === session.questions[questionIndex].answer) setScore((value) => value + 1);
  }

  function nextQuestion() {
    if (!session) return;
    if (questionIndex + 1 >= session.questions.length) {
      const finalScore = score;
      if (!recorded) {
        onCompletePractice(session.id, finalScore, session.questions.length, session.duration);
        setRecorded(true);
        onNotice(`${session.title} completed with ${finalScore}/${session.questions.length}.`);
      }
      setFinished(true);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setSelected(null);
    setChecked(false);
  }

  const question = session?.questions[questionIndex];

  return <div className="role-workspace student-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">PRACTICE LIBRARY</p><h1>Build your confidence</h1><p className="subheading">Short, focused activities designed around your goals and recent feedback.</p></div>
      <button type="button" className="primary-button" onClick={() => openSession(activities[0])}>Start recommended <Icon name="play" size={15} /></button>
    </section>

    <section className="student-practice-stats">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="zap" /></span><div><span>PRACTICE MINUTES</span><strong>{totalMinutes}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>SESSIONS DONE</span><strong>{practiceResults.length}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="target" /></span><div><span>ACCURACY</span><strong>{accuracy}%</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="star" /></span><div><span>WEEKLY STREAK</span><strong>12 days</strong></div></article>
    </section>

    <div className="student-practice-toolbar">
      <div className="student-pills">{categories.map((item) => <button type="button" className={`student-pill ${category === item ? "active" : ""}`} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <span className="student-filter-count">{filtered.length} activities</span>
    </div>

    <section className="practice-grid student-practice-grid">
      {filtered.map((activity) => <button type="button" className="panel practice-card student-practice-card" key={activity.id} onClick={() => openSession(activity)}>
        <span className={`practice-icon ${activity.tone}`}><Icon name={activity.icon as "headphones" | "book" | "mic" | "check"} /></span>
        <span className="practice-card-copy"><span className="eyebrow">{activity.category}</span><strong>{activity.title}</strong><p>{activity.description}</p><small>{activity.duration} min · {activity.questions.length} questions</small></span>
        <span className="practice-card-arrow"><Icon name="arrow" size={16} /></span>
      </button>)}
    </section>

    <div className="student-progress-columns">
      <section className="panel student-panel">
        <div className="panel-header"><div><h2>Recent practice</h2><p>Your latest completed activities</p></div></div>
        <div className="student-practice-history">
          {recent.length > 0 ? recent.map((result, index) => {
            const activity = activities.find((item) => item.id === result.activityId);
            return <div className="student-practice-history-row" key={`${result.activityId}-${result.completedAt}-${index}`}>
              <span className="metric-icon green"><Icon name="check" /></span>
              <div><strong>{activity?.title ?? "Practice activity"}</strong><small>{activity?.category ?? "Practice"} · {result.minutes} minutes</small></div>
              <span className="practice-score">{result.score}/{result.total}</span>
            </div>;
          }) : <div className="student-empty-inline"><Icon name="play" /><p>No practice yet. Start with a 5-minute speaking prompt.</p><button type="button" className="primary-button" onClick={() => openSession(activities[2])}>Start 5-min activity</button></div>}
        </div>
      </section>

      <section className="panel practice-tip student-practice-tip">
        <div className="metric-icon orange"><Icon name="sparkles" /></div>
        <div><span className="eyebrow">WEEKLY TIP</span><h2>Speak out loud, even when you practice alone.</h2><p>Recording yourself for two minutes helps you notice pronunciation patterns before your next lesson.</p><button type="button" className="text-button" onClick={() => onNotice("Voice recorder tip saved to your practice plan.")}>Add to my plan <Icon name="arrow" size={14} /></button></div>
      </section>
    </div>

    {session && <StudentModal eyebrow={`${session.category.toUpperCase()} PRACTICE`} title={session.title} description={`${session.duration} minutes · ${session.questions.length} questions`} onClose={closeSession} size="wide">
      {finished ? <div className="practice-result">
        <div className="practice-result-ring" style={{ background: `conic-gradient(#4f46e5 0 ${Math.round((score / session.questions.length) * 100)}%, #e2e8f0 ${Math.round((score / session.questions.length) * 100)}% 100%)` }}><strong>{Math.round((score / session.questions.length) * 100)}%</strong><span>{score} of {session.questions.length}</span></div>
        <h3>{score === session.questions.length ? "Perfect score!" : score >= session.questions.length / 2 ? "Nice work — keep going." : "Good start. Review and try again."}</h3>
        <p>You logged {session.duration} practice minutes. Your activity is saved to your progress history.</p>
        <div className="practice-result-actions">
          <button type="button" className="secondary-button" onClick={() => openSession(session)}>Try again</button>
          <button type="button" className="primary-button" onClick={closeSession}>Back to library</button>
        </div>
      </div> : question && <>
        <div className="practice-session-head"><span>Question {questionIndex + 1} of {session.questions.length}</span><div className="bar"><i style={{ width: `${((questionIndex + 1) / session.questions.length) * 100}%` }} /></div><strong>{score} correct</strong></div>
        <h3 className="practice-question">{question.prompt}</h3>
        <div className="practice-options">
          {question.options.map((option, index) => <button type="button" className={`practice-option ${selected === index ? "selected" : ""} ${checked && index === question.answer ? "correct" : ""} ${checked && selected === index && index !== question.answer ? "incorrect" : ""}`} key={option} onClick={() => { if (!checked) setSelected(index); }} disabled={checked}>
            <span>{String.fromCharCode(65 + index)}</span>{option}{checked && index === question.answer && <Icon name="check" size={16} />}
          </button>)}
        </div>
        {checked && <div className={`practice-explanation ${selected === question.answer ? "correct" : "incorrect"}`}><Icon name={selected === question.answer ? "check" : "help"} size={16} /><p>{question.explanation}</p></div>}
        <div className="practice-session-actions">
          <button type="button" className="cancel-button" onClick={closeSession}>Exit practice</button>
          {!checked ? <button type="button" className="primary-button" disabled={selected === null} onClick={checkAnswer}>Check answer</button> : <button type="button" className="primary-button" onClick={nextQuestion}>{questionIndex + 1 >= session.questions.length ? "Finish practice" : "Next question"} <Icon name="arrow" size={15} /></button>}
        </div>
      </>}
    </StudentModal>}
  </div>;
}
