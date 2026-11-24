"use client";

import { useCallback, useState, type ReactNode } from "react";
import Icon from "../Icon";
import { LibraryItemFormModal, formatFileSize, libraryFormValues, type LibraryFormValues } from "./LibraryForms";
import { useSchool } from "../../lib/hooks/useSchool";
import { can, libraryCategories, libraryItemsFor, nameOf, type LibraryItem, type SchoolData, type SchoolUser } from "../../lib/school";
import { downloadAttachmentFile } from "../../lib/school/attachment-download";
import { createLibraryItem, setLibraryItemStatus, updateLibraryItem, type ServiceCall } from "../../lib/school/services";

type Dialog = { kind: "create" } | { kind: "edit"; item: LibraryItem } | null;

function selectLibrary(data: SchoolData, user: SchoolUser, search: string, category: string, includeArchived: boolean) {
  return {
    categories: libraryCategories(data),
    rows: libraryItemsFor(data, { search, category, includeArchived }).map((item) => ({
      item,
      file: data.collections.attachments[item.attachmentId],
      creator: item.createdByName ?? nameOf(data, item.createdBy, "Staff"),
      lessons: Object.values(data.collections.lessonLibraryItems).filter((link) => link.libraryItemId === item.id).length,
      editable: can(data, user, "library.edit", { libraryItemId: item.id }),
    })),
  };
}

/**
 * The Curriculum Library: one school-wide set of reusable files. Admin and managers add items;
 * the creator or an admin edits and archives them. Materials reach lessons through the
 * "Materials" action on the Schedule and Students screens.
 */
export default function ManagerLibrary({ user, onNotice, toggle }: { user: SchoolUser; onNotice: (message: string) => void; toggle: ReactNode }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const select = useCallback((data: SchoolData) => selectLibrary(data, user, search, category, includeArchived), [user, search, category, includeArchived]);
  const { categories, rows } = useSchool(select);

  const notify = async (result: ServiceCall<unknown>, success: string) => { const resolved = await result; onNotice(resolved.ok ? success : resolved.error); };

  async function download(row: (typeof rows)[number]) {
    if (!row.file) return onNotice("This file is not available.");
    try {
      if (!(await downloadAttachmentFile(row.file))) onNotice(`${row.file.name} is not available in this browser.`);
    } catch {
      onNotice(`Could not download ${row.file.name}. Try again.`);
    }
  }

  async function submitCreate(values: LibraryFormValues, file: File | null) {
    if (!file) return { ok: false as const, error: "Choose a file to upload." };
    const result = await createLibraryItem(user.id, file, values);
    if (result.ok) onNotice(`${result.value.title} added to the library.`);
    return result;
  }

  return <div className="role-workspace">
    <section className="page-heading student-page-heading">
      <div>
        <p className="eyebrow">CURRICULUM</p>
        <h1>Library</h1>
        <p className="subheading">Reusable worksheets, slides, and handouts for the whole school. Attach them to lessons from the Schedule or Students screens.</p>
      </div>
      <div className="page-heading-actions">
        {toggle}
        <button type="button" className="primary-button" onClick={() => setDialog({ kind: "create" })}><Icon name="plus" size={15} /> Add material</button>
      </div>
    </section>

    <section className="panel student-panel">
      <div className="student-filterbar">
        <label className="student-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, category, or tags…" aria-label="Search library" /></label>
        <label className="student-select"><Icon name="filter" size={15} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="student-select"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Show archived</label>
        <span className="student-filter-count">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="course-grid">
        {rows.map((row) => <div className="course-card" key={row.item.id} data-testid="library-item">
          <div className="course-card-top"><span className="course-card-icon"><Icon name="file" size={18} /></span><span className={`course-status course-status-${row.item.status}`}>{row.item.status === "archived" ? "Archived" : "Published"}</span></div>
          <strong>{row.item.title}</strong>
          <small>{row.item.category}{row.item.level ? ` · ${row.item.level}` : ""} · by {row.creator}</small>
          {row.item.description && <p>{row.item.description}</p>}
          {row.item.tags.length > 0 && <div className="lesson-tags">{row.item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          <div className="course-card-stats"><span>{row.file ? `${row.file.name} · ${formatFileSize(row.file.size)}` : "File unavailable"}</span><span><b>{row.lessons}</b> lesson{row.lessons === 1 ? "" : "s"}</span></div>
          <div className="course-row-actions">
            <button type="button" className="secondary-button compact-button" onClick={() => void download(row)} disabled={!row.file}><Icon name="download" size={14} /> Download</button>
            {row.editable && <>
              <button type="button" className="secondary-button compact-button" onClick={() => setDialog({ kind: "edit", item: row.item })}><Icon name="edit" size={14} /> Edit</button>
              {row.item.status === "published"
                ? <button type="button" className="danger-outline-button compact-button" onClick={() => notify(setLibraryItemStatus(user.id, row.item.id, "archived"), `${row.item.title} archived. Lessons that already use it keep access.`)}>Archive</button>
                : <button type="button" className="secondary-button compact-button" onClick={() => notify(setLibraryItemStatus(user.id, row.item.id, "published"), `${row.item.title} is back in the library.`)}>Unarchive</button>}
            </>}
          </div>
        </div>)}
        {rows.length === 0 && <div className="student-empty-inline"><Icon name="book" /><p>{search || category ? "No materials match your filters." : "The library is empty. Add your first material."}</p></div>}
      </div>
    </section>

    {dialog?.kind === "create" && <LibraryItemFormModal categories={categories} onClose={() => setDialog(null)} onSubmit={submitCreate} />}
    {dialog?.kind === "edit" && <LibraryItemFormModal initial={libraryFormValues(dialog.item)} categories={categories} onClose={() => setDialog(null)} onSubmit={async (values) => {
      const result = await updateLibraryItem(user.id, dialog.item.id, values);
      if (result.ok) onNotice("Library item saved.");
      return result;
    }} />}
  </div>;
}
