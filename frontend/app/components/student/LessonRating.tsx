"use client";

import { useState } from "react";
import Icon from "../Icon";
import type { RateLessonInput, ServiceCall } from "../../lib/school/services";
import type { StudentLesson } from "../../lib/types";

const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

/**
 * Rate a completed lesson as the student or on behalf of a parent. Each can rate once; the
 * rating goes to the teacher's performance score straight away.
 */
export default function LessonRating({ lesson, onRate, onNotice }: {
  lesson: StudentLesson;
  onRate: (lessonId: string, input: RateLessonInput) => ServiceCall<unknown>;
  onNotice: (message: string) => void;
}) {
  const ratings = lesson.ratings ?? [];
  const open = (["student", "parent"] as const).filter((from) => !ratings.some((rating) => rating.from === from));
  const [from, setFrom] = useState<"student" | "parent">(open[0] ?? "student");
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const source = open.includes(from) ? from : open[0];

  if (lesson.status !== "completed") return null;
  if (lesson.attendance === "no-show") return <div className="lesson-detail-section"><span className="eyebrow">RATE THIS LESSON</span><p className="lesson-rating-hint">This lesson was marked as missed, so it can&apos;t be rated.</p></div>;

  async function submit() {
    if (!source) return;
    if (!score) return setError("Choose how many stars.");
    const result = await onRate(lesson.id, { from: source, score, comment });
    if (!result.ok) return setError(result.error);
    setError("");
    setScore(0);
    setComment("");
    onNotice(source === "parent" ? "Thanks! Your parent's rating was sent to the teacher's record." : "Thanks for rating your lesson!");
  }

  return <div className="lesson-detail-section lesson-rating">
    <span className="eyebrow">RATE THIS LESSON</span>
    {ratings.map((rating) => <div className="lesson-rating-done" key={rating.from}>
      <span className="lesson-rating-stars" aria-label={`${rating.score} out of 5`}>{[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= rating.score ? "filled" : ""}><Icon name="star" size={14} /></span>)}</span>
      <strong>{rating.from === "parent" ? "Parent rating" : "Your rating"}</strong>
      {rating.comment && <small>&ldquo;{rating.comment}&rdquo;</small>}
    </div>)}
    {source ? <div className="lesson-rating-form">
      {open.length > 1 && <div className="lesson-rating-source" role="radiogroup" aria-label="Rating as">
        {open.map((option) => <button type="button" key={option} role="radio" aria-checked={source === option} className={source === option ? "active" : ""} onClick={() => setFrom(option)}>{option === "student" ? "As me" : "As my parent"}</button>)}
      </div>}
      {open.length === 1 && <p className="lesson-rating-hint">Rating as {source === "parent" ? "your parent" : "yourself"}</p>}
      <div className="lesson-rating-picker" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} aria-label={`${star} star${star === 1 ? "" : "s"}`} className={star <= (hover || score) ? "filled" : ""} onMouseEnter={() => setHover(star)} onClick={() => setScore(star)}><Icon name="star" size={22} /></button>)}
        <span>{labels[hover || score] || "Tap a star"}</span>
      </div>
      <textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional: what went well or could be better?" aria-label="Comment" />
      {error && <p className="form-error" role="alert"><Icon name="x" size={14} /> {error}</p>}
      <button type="button" className="primary-button compact-button" onClick={submit}><Icon name="star" size={14} /> Send rating</button>
    </div> : <p className="lesson-rating-hint">Thanks, this lesson has been rated.</p>}
  </div>;
}
