"use client";

import { useCallback, useState, type FormEvent } from "react";
import Icon from "../Icon";
import Modal from "../shared/Modal";
import { useSchool } from "../../lib/hooks/useSchool";
import { can, libraryForLesson, libraryItemsFor, type LibraryItem, type SchoolData, type SchoolUser } from "../../lib/school";
import { attachLibraryItem, detachLibraryItem, type ServiceCall } from "../../lib/school/services";

export type LibraryFormValues = { title: string; category: string; level: string; description: string; tags: string };

export function libraryFormValues(item: LibraryItem): LibraryFormValues {
  return { title: item.title, category: item.category, level: item.level ?? "", description: item.description ?? "", tags: item.tags.join(", ") };
}

export function formatFileSize(size: number) {
  return size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

/**
 * Create (with a file) or edit (details only; the file never changes) a library item.
 * `categories` feeds the suggestion list so staff reuse existing categories.
 */
export function LibraryItemFormModal({ initial, categories, onSubmit, onClose }: {
  initial?: LibraryFormValues;
  categories: string[];
  onSubmit: (values: LibraryFormValues, file: File | null) => ServiceCall<unknown>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<LibraryFormValues>(initial ?? { title: "", category: "", level: "", description: "", tags: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const creating = !initial;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating && !file) return setError("Choose a file to upload.");
    setSaving(true);
    const result = await onSubmit(form, file);
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return <Modal eyebrow={creating ? "NEW MATERIAL" : "EDIT MATERIAL"} title={initial ? `Edit ${initial.title}` : "Add to the library"}
    description={creating ? "One file per item: PDF, image, Word, or PowerPoint, up to 5 MB." : "To replace the file, archive this item and add a new one."} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" form="library-item-form" className="primary-button" disabled={saving}>{creating ? "Add to library" : "Save changes"}</button></>}>
    <form id="library-item-form" className="student-form-grid" onSubmit={submit} noValidate>
      {creating && <label className="full-field">File<input type="file" accept=".pdf,image/*,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
      <label className="full-field">Title<input value={form.title} maxLength={200} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Airport vocabulary worksheet" autoFocus /></label>
      <label>Category<input value={form.category} maxLength={200} list="library-categories" onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Worksheets" /></label>
      <datalist id="library-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
      <label>Level (optional)<input value={form.level} maxLength={50} onChange={(event) => setForm({ ...form, level: event.target.value })} placeholder="e.g. B1" /></label>
      <label className="full-field">Description (optional)<textarea value={form.description} maxLength={2000} rows={3} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label className="full-field">Tags (optional, comma separated)<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="travel, speaking" /></label>
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}

/**
 * Library materials on one lesson: linked items with a remove control, plus a picker of
 * published items not yet attached. Attach needs a scheduled or live lesson; removing works on
 * any lesson. Reads the store live so the lists update after each change.
 */
export function LibraryPickerModal({ user, lessonId, lessonLabel, lessonOpen, onNotice, onClose }: {
  user: SchoolUser;
  lessonId: string;
  lessonLabel: string;
  /** Scheduled or live: new materials can be attached. */
  lessonOpen: boolean;
  onNotice: (message: string) => void;
  onClose: () => void;
}) {
  const select = useCallback((data: SchoolData) => {
    const attached = libraryForLesson(data, lessonId);
    const attachedIds = new Set(attached.map((item) => item.id));
    return {
      attached,
      available: libraryItemsFor(data).filter((item) => !attachedIds.has(item.id)),
      allowed: can(data, user, "lesson.attachLibraryItem", { lessonId }),
    };
  }, [lessonId, user]);
  const { attached, available, allowed } = useSchool(select);
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");
  const chosen = available.some((item) => item.id === itemId) ? itemId : available[0]?.id ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    const result = await attachLibraryItem(user.id, lessonId, chosen);
    if (!result.ok) return setError(result.error);
    setError("");
    setItemId("");
    onNotice(`${available.find((item) => item.id === chosen)?.title ?? "Material"} attached. The teacher and student see it now.`);
  }

  async function detach(item: LibraryItem) {
    const result = await detachLibraryItem(user.id, lessonId, item.id);
    if (!result.ok) return setError(result.error);
    onNotice(`${item.title} removed from the lesson.`);
  }

  return <Modal eyebrow="LESSON MATERIALS" title="Library materials for this lesson" description={lessonLabel} onClose={onClose}
    footer={<><button type="button" className="cancel-button" onClick={onClose}>Done</button>{lessonOpen && allowed && <button type="submit" form="library-picker-form" className="primary-button" disabled={!chosen}><Icon name="plus" size={14} /> Attach</button>}</>}>
    <form id="library-picker-form" className="student-form-grid" onSubmit={submit} noValidate>
      <div className="full-field lesson-detail-section">
        <span className="eyebrow">ATTACHED</span>
        <div className="manager-mini-list">
          {attached.map((item) => <div key={item.id}><strong>{item.title}<small className="manager-plan-line">{item.category}{item.status === "archived" ? " · archived" : ""}</small></strong>
            {allowed && <button type="button" className="secondary-button compact-button" onClick={() => void detach(item)} aria-label={`Remove ${item.title}`}>Remove</button>}
          </div>)}
          {attached.length === 0 && <p>No library materials on this lesson yet.</p>}
        </div>
      </div>
      {lessonOpen && allowed && <label className="full-field">Add from the library<select value={chosen} onChange={(event) => setItemId(event.target.value)} disabled={available.length === 0} aria-label="Library item">
        {available.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.category}{item.level ? ` · ${item.level}` : ""}</option>)}
        {available.length === 0 && <option value="">No other published materials</option>}
      </select></label>}
      {!lessonOpen && <p className="student-form-note full-field">Materials can only be attached to scheduled or live lessons.</p>}
      {error && <p className="form-error full-field" role="alert"><Icon name="x" size={14} /> {error}</p>}
    </form>
  </Modal>;
}
