"use client";

import { useCallback, useState, type FormEvent } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { CourseFormModal, LessonPlanModal, type CourseFormValues } from "./CurriculumForms";
import { useSchool } from "../../lib/hooks/useSchool";
import {
  activeEnrollmentCount,
  attachmentsForPlan,
  coursesForUser,
  lessonCountForPlan,
  nameOf,
  plansForCourse,
  plansForUnit,
  unitsForCourse,
  type AttachmentMeta,
  type Course,
  type CourseStatus,
  type SchoolData,
  type SchoolUser,
} from "../../lib/school";
import { downloadAttachmentFile } from "../../lib/school/attachment-download";
import {
  addUnit,
  canEditCourse,
  createCourse,
  detachFileFromPlan,
  duplicateCourse,
  moveLessonPlan,
  moveUnit,
  removeLessonPlan,
  removeUnit,
  renameUnit,
  saveLessonPlan,
  setCourseStatus,
  updateCourse,
  uploadPlanFile,
  type ServiceCall,
} from "../../lib/school/services";

const statusLabel: Record<CourseStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };

function CourseStatusPill({ status }: { status: CourseStatus }) {
  return <span className={`course-status course-status-${status}`}>{statusLabel[status]}</span>;
}

function selectLibrary(data: SchoolData, user: SchoolUser) {
  return coursesForUser(data, user).map((course) => ({
    course,
    owner: nameOf(data, course.ownerId, "Unknown"),
    units: unitsForCourse(data, course.id).length,
    plans: plansForCourse(data, course.id).length,
    students: activeEnrollmentCount(data, course.id),
    editable: canEditCourse(user, course),
  }));
}

function selectCourse(data: SchoolData, courseId: string | null) {
  if (!courseId) return null;
  const course = data.collections.courses[courseId];
  if (!course) return null;
  let number = 0; // Course-wide plan numbering (teaching order).
  return {
    course,
    owner: nameOf(data, course.ownerId, "Unknown"),
    students: activeEnrollmentCount(data, course.id),
    units: unitsForCourse(data, course.id).map((unit) => ({
      unit,
      plans: plansForUnit(data, unit.id).map((plan) => ({ plan, number: (number += 1), files: attachmentsForPlan(data, plan), lessons: lessonCountForPlan(data, plan.id) })),
    })),
  };
}

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; course: Course }
  | { kind: "unit"; courseId: string; unitId?: string; title: string }
  | { kind: "plan"; unitId: string; planId?: string }
  | null;

async function downloadFile(file: AttachmentMeta, onNotice: (message: string) => void) {
  try {
    if (!(await downloadAttachmentFile(file))) onNotice(`${file.name} is not available in this browser.`);
  } catch {
    onNotice(`Could not download ${file.name}. Try again.`);
  }
}

function UnitNameModal({ initial, onSubmit, onClose }: { initial: string; onSubmit: (title: string) => ServiceCall<unknown>; onClose: () => void }) {
  const [title, setTitle] = useState(initial);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onSubmit(title);
    if (result.ok) onClose();
    else setError(result.error);
  }
  return <Modal eyebrow="UNIT" title={initial ? "Rename unit" : "Add a unit"} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form="unit-form" className="primary-button">Save</button></>}>
    <form id="unit-form" className="student-form-grid" onSubmit={submit} noValidate>
      <label className="full-field">Unit name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Unit 2: At the airport" autoFocus /></label>
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}

export default function ManagerCurriculum({ user, onNotice }: { user: SchoolUser; onNotice: (message: string) => void }) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | CourseStatus>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const selectLib = useCallback((data: SchoolData) => selectLibrary(data, user), [user]);
  const library = useSchool(selectLib);
  const selectOpen = useCallback((data: SchoolData) => selectCourse(data, courseId), [courseId]);
  const open = useSchool(selectOpen);

  const notify = async (result: ServiceCall<unknown>, success: string) => { const resolved = await result; onNotice(resolved.ok ? success : resolved.error); };
  const editable = open ? canEditCourse(user, open.course) : false;
  const planDialog = dialog?.kind === "plan" && open ? (() => {
    const unitRow = open.units.find((row) => row.unit.id === dialog.unitId);
    const planRow = unitRow?.plans.find((row) => row.plan.id === dialog.planId);
    return unitRow ? { unitRow, planRow } : null;
  })() : null;

  const dialogs = <>
    {dialog?.kind === "create" && <CourseFormModal onClose={() => setDialog(null)} onSubmit={async (values: CourseFormValues) => {
      const result = await createCourse(user.id, values);
      if (result.ok) { setCourseId(result.value.id); onNotice(`${result.value.title} created as a draft. Add lesson plans, then publish.`); }
      return result;
    }} /> }
    {dialog?.kind === "edit" && <CourseFormModal initial={{ title: dialog.course.title, level: dialog.course.level, summary: dialog.course.summary, objectives: dialog.course.objectives.join("\n") }} onClose={() => setDialog(null)} onSubmit={async (values) => {
      const result = await updateCourse(user.id, dialog.course.id, values);
      if (result.ok) onNotice("Course details saved.");
      return result;
    }} />}
    {dialog?.kind === "unit" && <UnitNameModal initial={dialog.title} onClose={() => setDialog(null)} onSubmit={(title) => dialog.unitId ? renameUnit(user.id, dialog.unitId, title) : addUnit(user.id, dialog.courseId, title)} />}
    {planDialog && dialog?.kind === "plan" && <LessonPlanModal
      unitTitle={planDialog.unitRow.unit.title}
      plan={planDialog.planRow?.plan}
      files={planDialog.planRow?.files ?? []}
      readOnly={!editable}
      onSave={(values) => saveLessonPlan(user.id, dialog.unitId, values, dialog.planId)}
      onUpload={async (planId, file) => {
        if (!dialog.planId) setDialog({ ...dialog, planId });
        const result = await uploadPlanFile(user.id, planId, file);
        if (result.ok) onNotice(`${file.name} attached.`);
        return result;
      }}
      onRemoveFile={(planId, attachmentId) => detachFileFromPlan(user.id, planId, attachmentId)}
      onDownload={(file) => void downloadFile(file, onNotice)}
      onClose={() => setDialog(null)} />}
  </>;

  // Course editor ---------------------------------------------------------------------------
  if (open) {
    const { course } = open;
    const totalPlans = open.units.reduce((total, row) => total + row.plans.length, 0);
    return <div className="role-workspace">
      <button type="button" className="text-button course-back" onClick={() => setCourseId(null)}><Icon name="arrowLeft" size={14} /> All courses</button>
      <section className="page-heading student-page-heading">
        <div>
          <p className="eyebrow">COURSE · {course.level.toUpperCase()}</p>
          <h1>{course.title} <CourseStatusPill status={course.status} /></h1>
          <p className="subheading">{course.summary || "No summary yet."}</p>
          <p className="course-meta">{totalPlans} lesson plan{totalPlans === 1 ? "" : "s"} · {open.units.length} unit{open.units.length === 1 ? "" : "s"} · {open.students} enrolled student{open.students === 1 ? "" : "s"} · owned by {open.owner}</p>
        </div>
        <div className="page-heading-actions">
          <button type="button" className="secondary-button" onClick={async () => { const result = await duplicateCourse(user.id, course.id); if (result.ok) setCourseId(result.value.id); onNotice(result.ok ? "Copied as a new draft you own." : result.error); }}><Icon name="repeat" size={15} /> Duplicate</button>
          {editable && <>
            <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "edit", course })}><Icon name="edit" size={15} /> Details</button>
            {course.status === "published"
              ? <button type="button" className="secondary-button" onClick={() => notify(setCourseStatus(user.id, course.id, "draft"), "Moved back to draft. New students can't be enrolled until it's published again.")}>Unpublish</button>
              : <button type="button" className="primary-button" onClick={() => notify(setCourseStatus(user.id, course.id, "published"), `${course.title} is published. Managers can enroll students in it.`)}><Icon name="check" size={15} /> Publish</button>}
          </>}
        </div>
      </section>

      {!editable && <div className="lesson-callout course-readonly"><Icon name="lock" size={16} /><div><strong>View only</strong><p>{open.owner} owns this course. Duplicate it to make your own editable version.</p></div></div>}
      {course.objectives.length > 0 && <section className="panel student-panel course-objectives"><span className="eyebrow">OBJECTIVES</span><ul>{course.objectives.map((objective) => <li key={objective}><Icon name="target" size={14} />{objective}</li>)}</ul></section>}

      {open.units.map(({ unit, plans }, unitIndex) => <section className="panel student-panel course-unit" key={unit.id}>
        <div className="panel-header">
          <div><h2>{unit.title}</h2><p>{plans.length} lesson plan{plans.length === 1 ? "" : "s"}</p></div>
          {editable && <div className="course-row-actions">
            <button type="button" className="icon-button" aria-label="Move unit up" disabled={unitIndex === 0} onClick={() => notify(moveUnit(user.id, unit.id, -1), "Unit moved.")}><Icon name="chevronLeft" size={15} /></button>
            <button type="button" className="icon-button" aria-label="Move unit down" disabled={unitIndex === open.units.length - 1} onClick={() => notify(moveUnit(user.id, unit.id, 1), "Unit moved.")}><Icon name="chevronRight" size={15} /></button>
            <button type="button" className="icon-button" aria-label="Rename unit" onClick={() => setDialog({ kind: "unit", courseId: course.id, unitId: unit.id, title: unit.title })}><Icon name="edit" size={15} /></button>
            <button type="button" className="icon-button" aria-label="Delete unit" onClick={() => notify(removeUnit(user.id, unit.id), "Unit deleted.")}><Icon name="trash" size={15} /></button>
          </div>}
        </div>
        <div className="course-plan-list">
          {plans.map(({ plan, number, files, lessons }, planIndex) => {
            return <div className="course-plan" key={plan.id}>
              <span className="course-plan-number">{number}</span>
              <button type="button" className="course-plan-main" onClick={() => setDialog({ kind: "plan", unitId: unit.id, planId: plan.id })}>
                <strong>{plan.title}</strong>
                <small>{plan.summary || "No summary"}</small>
                <span className="course-plan-meta">
                  {plan.focus.map((item) => <em key={item}>{item}</em>)}
                  <span>{plan.sections.length} section{plan.sections.length === 1 ? "" : "s"}</span>
                  {files.length > 0 && <span><Icon name="file" size={12} /> {files.length} file{files.length === 1 ? "" : "s"}</span>}
                  {lessons > 0 && <span>used in {lessons} lesson{lessons === 1 ? "" : "s"}</span>}
                </span>
              </button>
              {editable && <div className="course-row-actions">
                <button type="button" className="icon-button" aria-label="Move plan up" disabled={planIndex === 0} onClick={() => notify(moveLessonPlan(user.id, plan.id, -1), "Plan moved.")}><Icon name="chevronLeft" size={15} /></button>
                <button type="button" className="icon-button" aria-label="Move plan down" disabled={planIndex === plans.length - 1} onClick={() => notify(moveLessonPlan(user.id, plan.id, 1), "Plan moved.")}><Icon name="chevronRight" size={15} /></button>
                <button type="button" className="icon-button" aria-label="Delete plan" onClick={() => notify(removeLessonPlan(user.id, plan.id), `${plan.title} deleted.`)}><Icon name="trash" size={15} /></button>
              </div>}
            </div>;
          })}
          {plans.length === 0 && <div className="student-empty-inline"><Icon name="book" /><p>No lesson plans in this unit yet.</p></div>}
          {editable && <button type="button" className="course-add-plan" onClick={() => setDialog({ kind: "plan", unitId: unit.id })}><Icon name="plus" size={15} /> Add lesson plan</button>}
        </div>
      </section>)}

      {editable && <div className="course-footer-actions">
        <button type="button" className="secondary-button" onClick={() => setDialog({ kind: "unit", courseId: course.id, title: "" })}><Icon name="plus" size={15} /> Add unit</button>
        {course.status !== "archived"
          ? <button type="button" className="danger-outline-button" onClick={() => notify(setCourseStatus(user.id, course.id, "archived"), "Course archived.")}>Archive course</button>
          : <button type="button" className="secondary-button" onClick={() => notify(setCourseStatus(user.id, course.id, "draft"), "Course restored as a draft.")}>Restore as draft</button>}
      </div>}
      {dialogs}
    </div>;
  }

  // Library ---------------------------------------------------------------------------------
  const counts = { all: library.length, published: 0, draft: 0, archived: 0 } as Record<"all" | CourseStatus, number>;
  library.forEach((row) => { counts[row.course.status] += 1; });
  const shown = library.filter((row) => filter === "all" || row.course.status === filter);
  const tabs: { key: "all" | CourseStatus; label: string }[] = [{ key: "all", label: "All" }, { key: "published", label: "Published" }, { key: "draft", label: "Drafts" }, { key: "archived", label: "Archived" }];

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">CURRICULUM</p>
        <h1>Courses</h1>
        <p className="subheading">Build courses from 25-minute lesson plans. Booked lessons get the next plan of the student&apos;s course automatically.</p>
      </div>
      <div className="page-heading-actions">
        <button type="button" className="primary-button" onClick={() => setDialog({ kind: "create" })}><Icon name="plus" size={15} /> New course</button>
      </div>
    </section>

    <section className="panel student-panel">
      <div className="student-tabbar" role="tablist" aria-label="Filter courses">
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={filter === tab.key} className={`student-tab ${filter === tab.key ? "active" : ""}`} key={tab.key} onClick={() => setFilter(tab.key)}>{tab.label}<span>{counts[tab.key]}</span></button>)}
      </div>
      <div className="course-grid">
        {shown.map((row) => <button type="button" className="course-card" key={row.course.id} onClick={() => setCourseId(row.course.id)}>
          <div className="course-card-top"><span className="course-card-icon"><Icon name="book" size={18} /></span><CourseStatusPill status={row.course.status} /></div>
          <strong>{row.course.title}</strong>
          <small>{row.course.level} · by {row.owner}{row.editable ? "" : " · view only"}</small>
          <p>{row.course.summary || "No summary yet."}</p>
          <div className="course-card-stats"><span><b>{row.plans}</b> plans</span><span><b>{row.units}</b> units</span><span><b>{row.students}</b> students</span></div>
        </button>)}
        {shown.length === 0 && <div className="student-empty-inline"><Icon name="book" /><p>No {filter === "all" ? "" : `${statusLabel[filter as CourseStatus].toLowerCase()} `}courses yet.</p></div>}
      </div>
    </section>
    {dialogs}
  </div>;
}
