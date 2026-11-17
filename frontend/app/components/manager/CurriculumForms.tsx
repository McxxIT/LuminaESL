"use client";

import { useState, type FormEvent } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { teacherLevelOptions } from "../../lib/data";
import type { AttachmentMeta, LessonPlan, LessonPlanSection } from "../../lib/school";
import { DEFAULT_PLAN_SECTIONS, type ServiceCall, type ServiceResult } from "../../lib/school/services";

export type CourseFormValues = { title: string; level: string; summary: string; objectives: string };

export function CourseFormModal({ initial, onSubmit, onClose }: {
  initial?: CourseFormValues;
  onSubmit: (values: CourseFormValues) => ServiceCall<unknown>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CourseFormValues>(initial ?? { title: "", level: "B1 Intermediate", summary: "", objectives: "" });
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onSubmit(form);
    if (result.ok) onClose();
    else setError(result.error);
  }
  const levels = Array.from(new Set(["All levels", "A2-C1", ...teacherLevelOptions, form.level]));
  return <Modal eyebrow={initial ? "EDIT COURSE" : "NEW COURSE"} title={initial ? `Edit ${initial.title}` : "Create a course"} description={initial ? undefined : "Courses start as drafts. Add units and lesson plans, then publish."} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form="course-form" className="primary-button">{initial ? "Save changes" : "Create course"}</button></>}>
    <form id="course-form" className="student-form-grid" onSubmit={submit} noValidate>
      <label className="full-field">Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Travel English essentials" autoFocus /></label>
      <label className="full-field">Level<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>{levels.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
      <label className="full-field">Summary<textarea rows={2} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="What this course helps students do." /></label>
      <label className="full-field">Objectives<textarea rows={3} value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} placeholder="One per line" /></label>
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type SectionDraft = { heading: string; items: string };

/**
 * Create or edit a 25-minute lesson plan. Files can be added once the plan exists, because
 * uploads are stored against the saved plan.
 */
export function LessonPlanModal({ unitTitle, plan, files, readOnly = false, onSave, onUpload, onRemoveFile, onDownload, onClose }: {
  unitTitle: string;
  /** View-only course: fields disabled, files downloadable. */
  readOnly?: boolean;
  plan?: LessonPlan;
  files: AttachmentMeta[];
  onSave: (values: { title: string; focus: string; summary: string; sections: LessonPlanSection[] }) => ServiceCall<LessonPlan>;
  onUpload: (planId: string, file: File) => Promise<ServiceResult<unknown>>;
  onRemoveFile: (planId: string, attachmentId: string) => ServiceCall<unknown>;
  onDownload: (file: AttachmentMeta) => void;
  onClose: () => void;
}) {
  const [savedPlanId, setSavedPlanId] = useState(plan?.id);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [focus, setFocus] = useState(plan?.focus.join(", ") ?? "");
  const [summary, setSummary] = useState(plan?.summary ?? "");
  const [sections, setSections] = useState<SectionDraft[]>(
    (plan?.sections.length ? plan.sections : DEFAULT_PLAN_SECTIONS).map((section) => ({ heading: section.heading, items: section.items.join("\n") })),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);

  async function save(closeAfter: boolean) {
    const result = await onSave({ title, focus, summary, sections: sections.map((section) => ({ heading: section.heading, items: section.items.split("\n") })) });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError("");
    setSavedPlanId(result.value.id);
    if (closeAfter) onClose();
    else setNotice("Saved. You can now attach files.");
    return true;
  }

  async function upload(fileList: FileList | null) {
    if (!fileList?.length || !savedPlanId) return;
    setUploading(true);
    setError("");
    setNotice("");
    for (const file of Array.from(fileList)) {
      const result = await onUpload(savedPlanId, file);
      if (!result.ok) setError(result.error);
    }
    setUploading(false);
  }

  function updateSection(index: number, change: Partial<SectionDraft>) {
    setSections((current) => current.map((section, position) => position === index ? { ...section, ...change } : section));
  }

  return <Modal eyebrow={`LESSON PLAN · ${unitTitle.toUpperCase()}`} title={readOnly ? plan?.title ?? "Lesson plan" : plan ? `Edit ${plan.title}` : "New lesson plan"} description={readOnly ? "View only. Duplicate the course to make your own editable version." : "Every plan is one 25-minute lesson. Teachers download it; students see the summary before class."} onClose={onClose} size="wide"
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Close</button>{!readOnly && <button type="button" className="primary-button" onClick={() => save(true)}><Icon name="save" size={14} /> Save plan</button>}</>}>
    <fieldset className="plan-fieldset" disabled={readOnly}>
    <div className="student-form-grid">
      <label className="full-field">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Ordering food and drinks" autoFocus /></label>
      <label className="full-field">Focus<input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="Comma separated, e.g. Speaking, Vocabulary" /></label>
      <label className="full-field">Summary<textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="One or two sentences students read before class." /></label>
    </div>

    <div className="plan-sections">
      <div className="plan-sections-head"><span className="eyebrow">LESSON FLOW</span>{!readOnly && <button type="button" className="text-button" onClick={() => setSections((current) => [...current, { heading: "", items: "" }])}><Icon name="plus" size={14} /> Add section</button>}</div>
      {sections.map((section, index) => <div className="plan-section" key={index}>
        <div className="plan-section-top">
          <input value={section.heading} onChange={(event) => updateSection(index, { heading: event.target.value })} placeholder="Section heading, e.g. Main task (15 min)" aria-label={`Section ${index + 1} heading`} />
          {!readOnly && <button type="button" className="icon-button" aria-label={`Remove section ${index + 1}`} onClick={() => setSections((current) => current.filter((_, position) => position !== index))}><Icon name="trash" size={15} /></button>}
        </div>
        <textarea rows={3} value={section.items} onChange={(event) => updateSection(index, { items: event.target.value })} placeholder="One step per line" aria-label={`Section ${index + 1} steps`} />
      </div>)}
    </div>

    </fieldset>

    <div className="plan-files">
      {!readOnly && !savedPlanId && <button type="button" className="secondary-button compact-button plan-save-first" onClick={() => save(false)}><Icon name="save" size={14} /> Save plan to attach files</button>}
      <div className="plan-sections-head"><span className="eyebrow">FILES FOR TEACHERS</span><span className="manager-help">PDF, images, Word or PowerPoint · up to 5 MB each</span></div>
      {files.map((file) => <div className="plan-file" key={file.id}>
        <Icon name="file" size={16} />
        <button type="button" className="plan-file-name" onClick={() => onDownload(file)}>{file.name}</button>
        <small>{formatSize(file.size)}</small>
        {!readOnly && savedPlanId && <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={async () => { const result = await onRemoveFile(savedPlanId, file.id); if (!result.ok) setError(result.error); }}><Icon name="trash" size={15} /></button>}
      </div>)}
      {readOnly && files.length === 0 && <p className="manager-help">No files attached.</p>}
      {!readOnly && <label className={`plan-upload ${uploading ? "is-busy" : ""} ${savedPlanId ? "" : "is-disabled"}`}>
        <Icon name="upload" size={16} />
        <span>{uploading ? "Uploading…" : savedPlanId ? "Attach files" : "Save the plan first, then attach files"}</span>
        <input type="file" multiple accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx" disabled={uploading || !savedPlanId} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
      </label>}
    </div>

    {notice && !error && <p className="plan-notice"><Icon name="check" size={14} /> {notice}</p>}
    {error && <p className="form-error" role="alert"><Icon name="x" size={14} /> {error}</p>}
  </Modal>;
}

/** Choose the lesson plan for one upcoming lesson (or remove it). The student's course is listed first. */
export function PlanPickerModal({ lessonLabel, groups, currentPlanId, preferredCourseId, onSubmit, onClose }: {
  lessonLabel: string;
  groups: { course: { id: string; title: string }; plans: LessonPlan[] }[];
  currentPlanId?: string;
  preferredCourseId?: string;
  onSubmit: (planId: string | null) => ServiceCall<unknown>;
  onClose: () => void;
}) {
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [error, setError] = useState("");
  const ordered = [...groups].sort((a, b) => Number(b.course.id === preferredCourseId) - Number(a.course.id === preferredCourseId));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onSubmit(planId || null);
    if (result.ok) onClose();
    else setError(result.error);
  }
  return <Modal eyebrow="LESSON PLAN" title="Change the plan for this lesson" description={lessonLabel} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form="plan-picker-form" className="primary-button">Save plan</button></>}>
    <form id="plan-picker-form" className="student-form-grid" onSubmit={submit} noValidate>
      <label className="full-field">Plan<select value={planId} onChange={(event) => setPlanId(event.target.value)} autoFocus>
        <option value="">No plan</option>
        {ordered.map((group) => <optgroup key={group.course.id} label={group.course.id === preferredCourseId ? `${group.course.title} (student's course)` : group.course.title}>
          {group.plans.map((plan, index) => <option key={plan.id} value={plan.id}>{index + 1}. {plan.title}</option>)}
        </optgroup>)}
      </select></label>
      <p className="student-form-note full-field">The teacher and student see the new plan right away. The student&apos;s course progress does not change.</p>
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}
