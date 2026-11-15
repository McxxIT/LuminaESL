"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "../Icon";
import StudentModal from "../student/StudentModal";
import type { CurriculumUnitInput } from "./useTeacherWorkspace";
import { teacherFocusOptions, teacherLevelOptions } from "../../lib/data";
import type { CurriculumLesson, CurriculumUnit } from "../../lib/types";

type CurriculumProps = {
  units: CurriculumUnit[];
  onCreateUnit: (input: CurriculumUnitInput) => void;
  onUpdateUnit: (id: string, input: CurriculumUnitInput) => void;
  onTogglePublish: (id: string) => void;
  onMoveUnit: (id: string, direction: -1 | 1) => void;
  onNotice: (message: string) => void;
};

type EditorState = {
  title: string;
  level: string;
  summary: string;
  objectivesText: string;
  lessons: CurriculumLesson[];
};

const emptyEditor: EditorState = {
  title: "",
  level: teacherLevelOptions[2],
  summary: "",
  objectivesText: "",
  lessons: [{ id: "draft-lesson-1", title: "", focus: teacherFocusOptions[0], minutes: 45 }],
};

export default function TeacherCurriculum({ units, onCreateUnit, onUpdateUnit, onTogglePublish, onMoveUnit, onNotice }: CurriculumProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  const ordered = useMemo(() => [...units].sort((a, b) => a.order - b.order), [units]);
  const published = units.filter((unit) => unit.status === "published").length;
  const drafts = units.length - published;
  const totalLessons = units.reduce((total, unit) => total + unit.lessons.length, 0);

  function openCreate() {
    setEditingId(null);
    setEditor({ ...emptyEditor, lessons: [{ ...emptyEditor.lessons[0], id: `draft-${Date.now()}` }] });
    setEditorOpen(true);
  }

  function openEdit(unit: CurriculumUnit) {
    setEditingId(unit.id);
    setEditor({
      title: unit.title,
      level: unit.level,
      summary: unit.summary,
      objectivesText: unit.objectives.join("\n"),
      lessons: unit.lessons.map((lesson) => ({ ...lesson })),
    });
    setEditorOpen(true);
  }

  function updateLesson(index: number, patch: Partial<CurriculumLesson>) {
    setEditor((current) => ({
      ...current,
      lessons: current.lessons.map((lesson, position) => position === index ? { ...lesson, ...patch } : lesson),
    }));
  }

  function addLessonRow() {
    setEditor((current) => ({
      ...current,
      lessons: [...current.lessons, { id: `draft-${Date.now()}`, title: "", focus: teacherFocusOptions[0], minutes: 45 }],
    }));
  }

  function removeLessonRow(index: number) {
    setEditor((current) => ({ ...current, lessons: current.lessons.filter((_, position) => position !== index) }));
  }

  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor.title.trim()) {
      onNotice("Give the unit a title.");
      return;
    }
    const lessons = editor.lessons
      .map((lesson) => ({ title: lesson.title.trim(), focus: lesson.focus, minutes: Number(lesson.minutes) || 45 }))
      .filter((lesson) => lesson.title.length > 0);
    const input: CurriculumUnitInput = {
      title: editor.title.trim(),
      level: editor.level,
      summary: editor.summary.trim(),
      objectives: editor.objectivesText.split("\n").map((line) => line.trim()).filter(Boolean),
      lessons,
    };
    if (editingId) {
      onUpdateUnit(editingId, input);
      onNotice(`${input.title} updated.`);
    } else {
      onCreateUnit(input);
      onNotice(`${input.title} created as a draft.`);
    }
    setEditorOpen(false);
    setEditingId(null);
  }

  return <div className="role-workspace teacher-page">
    <section className="page-heading student-page-heading">
      <div><p className="eyebrow">CURRICULUM STUDIO</p><h1>Lesson plans & units</h1><p className="subheading">Shape the learning path, publish what is ready, and keep every unit current.</p></div>
      <div className="page-heading-actions">
        <button type="button" className="secondary-button" onClick={() => onNotice("Curriculum templates opened.")}><Icon name="file" size={15} /> Templates</button>
        <button type="button" className="primary-button" onClick={openCreate}><Icon name="plus" size={15} /> New unit</button>
      </div>
    </section>

    <section className="student-lessons-summary">
      <article className="student-summary-card"><span className="metric-icon blue"><Icon name="book" /></span><div><span>TOTAL UNITS</span><strong>{units.length}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon green"><Icon name="check" /></span><div><span>PUBLISHED</span><strong>{published}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon orange"><Icon name="edit" /></span><div><span>DRAFTS</span><strong>{drafts}</strong></div></article>
      <article className="student-summary-card"><span className="metric-icon violet"><Icon name="calendar" /></span><div><span>LESSONS PLANNED</span><strong>{totalLessons}</strong></div></article>
    </section>

    <section className="teacher-unit-grid">
      {ordered.map((unit, index) => <article className="panel teacher-unit-card" key={unit.id}>
        <div className="teacher-unit-head">
          <span className="teacher-unit-order">{String(index + 1).padStart(2, "0")}</span>
          <div className="teacher-unit-copy">
            <div className="teacher-unit-title"><h2>{unit.title}</h2><span className={`teacher-unit-status ${unit.status}`}>{unit.status === "published" ? "Published" : "Draft"}</span></div>
            <p>{unit.level} · {unit.lessons.length} lessons · updated {unit.updatedAt}</p>
          </div>
          <div className="teacher-order-buttons">
            <button type="button" aria-label={`Move ${unit.title} up`} disabled={index === 0} onClick={() => onMoveUnit(unit.id, -1)}><Icon name="chevron" size={14} /></button>
            <button type="button" aria-label={`Move ${unit.title} down`} disabled={index === ordered.length - 1} onClick={() => onMoveUnit(unit.id, 1)}><Icon name="chevron" size={14} /></button>
          </div>
        </div>

        <p className="teacher-unit-summary">{unit.summary}</p>

        {unit.objectives.length > 0 && <ul className="teacher-unit-objectives">
          {unit.objectives.map((objective) => <li key={objective}><Icon name="check" size={12} /> {objective}</li>)}
        </ul>}

        <div className="teacher-unit-lessons">
          {unit.lessons.map((lesson, lessonIndex) => <div className="teacher-unit-lesson" key={lesson.id}>
            <span>{String(lessonIndex + 1).padStart(2, "0")}</span>
            <div><strong>{lesson.title}</strong><small>{lesson.focus}</small></div>
            <em>{lesson.minutes} min</em>
          </div>)}
          {unit.lessons.length === 0 && <div className="student-empty-inline"><Icon name="book" /><p>No lessons in this unit yet.</p></div>}
        </div>

        <div className="teacher-unit-actions">
          <button type="button" className="secondary-button compact-button" onClick={() => { onTogglePublish(unit.id); onNotice(`${unit.title} ${unit.status === "published" ? "moved to draft" : "published"}.`); }}><Icon name={unit.status === "published" ? "lock" : "external"} size={14} /> {unit.status === "published" ? "Unpublish" : "Publish"}</button>
          <button type="button" className="icon-text-button" onClick={() => openEdit(unit)}><Icon name="edit" size={14} /> Edit plan</button>
        </div>
      </article>)}
    </section>

    {units.length === 0 && <section className="panel student-panel"><div className="student-empty-state">
      <div className="student-empty-icon"><Icon name="book" size={22} /></div>
      <h3>No curriculum units yet</h3>
      <p>Create your first unit to give students a clear learning path.</p>
      <button type="button" className="primary-button" onClick={openCreate}><Icon name="plus" size={15} /> New unit</button>
    </div></section>}

    {editorOpen && <StudentModal eyebrow={editingId ? "EDIT UNIT" : "NEW UNIT"} title={editingId ? "Edit lesson plan" : "Create a curriculum unit"} description="Set the outcomes, then shape the lesson sequence." onClose={() => { setEditorOpen(false); setEditingId(null); }} size="wide"
      footer={<><button type="button" className="cancel-button" onClick={() => { setEditorOpen(false); setEditingId(null); }}>Cancel</button><button type="submit" form="teacher-unit-form" className="primary-button"><Icon name="save" size={15} /> {editingId ? "Save unit" : "Create unit"}</button></>}>
      <form id="teacher-unit-form" className="student-form-grid" onSubmit={submitEditor}>
        <label className="full-field">Unit title<input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="e.g. Conversation confidence" required /></label>
        <label>Level<select value={editor.level} onChange={(event) => setEditor({ ...editor, level: event.target.value })}>{teacherLevelOptions.map((level) => <option value={level} key={level}>{level}</option>)}</select></label>
        <label>Summary<input value={editor.summary} onChange={(event) => setEditor({ ...editor, summary: event.target.value })} placeholder="What does this unit help students do?" /></label>
        <label className="full-field">Objectives <small>One per line</small><textarea rows={3} value={editor.objectivesText} onChange={(event) => setEditor({ ...editor, objectivesText: event.target.value })} placeholder={"Speak more fluently\nUse linking phrases\nSelf-correct common errors"} /></label>

        <div className="full-field teacher-lesson-editor-head">
          <div><strong>Lesson plan</strong><small>{editor.lessons.length} lesson{editor.lessons.length === 1 ? "" : "s"}</small></div>
          <button type="button" className="secondary-button compact-button" onClick={addLessonRow}><Icon name="plus" size={14} /> Add lesson</button>
        </div>

        <div className="full-field teacher-lesson-editor">
          {editor.lessons.map((lesson, index) => <div className="teacher-lesson-editor-row" key={lesson.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <input value={lesson.title} onChange={(event) => updateLesson(index, { title: event.target.value })} placeholder="Lesson title" aria-label={`Lesson ${index + 1} title`} />
            <select value={lesson.focus} onChange={(event) => updateLesson(index, { focus: event.target.value })} aria-label={`Lesson ${index + 1} focus`}>{teacherFocusOptions.map((focus) => <option value={focus} key={focus}>{focus}</option>)}</select>
            <input type="number" min={15} max={120} value={lesson.minutes} onChange={(event) => updateLesson(index, { minutes: Number(event.target.value) })} aria-label={`Lesson ${index + 1} minutes`} />
            <button type="button" className="icon-button" aria-label={`Remove lesson ${index + 1}`} disabled={editor.lessons.length === 1} onClick={() => removeLessonRow(index)}><Icon name="trash" size={14} /></button>
          </div>)}
        </div>
        <p className="student-form-note full-field">New units start as drafts. Publish when the lesson sequence is ready for students.</p>
      </form>
    </StudentModal>}
  </div>;
}
