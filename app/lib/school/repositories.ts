import type { ActivityEntry, CollectionName, EntityOf, SchoolData } from "./types";

/**
 * Typed, storage-agnostic access to one collection. Reads take any snapshot; writes take the
 * draft passed to `updateSchool`, so a service can change several collections in one transaction.
 */

export function list<C extends CollectionName>(data: SchoolData, collection: C): EntityOf<C>[] {
  return Object.values(data.collections[collection]) as EntityOf<C>[];
}

export function get<C extends CollectionName>(data: SchoolData, collection: C, id: string | null | undefined): EntityOf<C> | undefined {
  if (!id) return undefined;
  return data.collections[collection][id] as EntityOf<C> | undefined;
}

export function query<C extends CollectionName>(data: SchoolData, collection: C, predicate: (entity: EntityOf<C>) => boolean): EntityOf<C>[] {
  return list(data, collection).filter(predicate);
}

export function upsert<C extends CollectionName>(draft: SchoolData, collection: C, entity: EntityOf<C>): EntityOf<C> {
  (draft.collections[collection] as Record<string, EntityOf<C>>)[entity.id] = entity;
  return entity;
}

export function patch<C extends CollectionName>(draft: SchoolData, collection: C, id: string, changes: Partial<EntityOf<C>>): EntityOf<C> | undefined {
  const current = get(draft, collection, id);
  if (!current) return undefined;
  return upsert(draft, collection, { ...current, ...changes } as EntityOf<C>);
}

export function remove<C extends CollectionName>(draft: SchoolData, collection: C, id: string): boolean {
  const records = draft.collections[collection] as Record<string, EntityOf<C>>;
  if (!(id in records)) return false;
  delete records[id];
  return true;
}

let idCounter = 0;

/** Unique, sortable-enough id for client-side records, e.g. `lesson-lq3k9x-1a2b`. */
export function createId(prefix: string) {
  idCounter = (idCounter + 1) % 1_679_616;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36).padStart(4, "0")}`;
}

export function recordActivity(draft: SchoolData, entry: Omit<ActivityEntry, "id" | "createdAt"> & { createdAt?: string }) {
  return upsert(draft, "activity", { ...entry, id: createId("activity"), createdAt: entry.createdAt ?? new Date().toISOString() });
}
