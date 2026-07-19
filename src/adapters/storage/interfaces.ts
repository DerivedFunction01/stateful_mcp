import type { OwnerScope } from "../../config/types";
import type { FilterState } from "../../middleware/filter/types";
import type { ObjectState } from "../../middleware/object/types";

// Session store — keyed by (sessionId, id). TTL-cleaned.
export interface SessionFilterStore {
  get(sessionId: string, id: string): Promise<FilterState | null>;
  set(sessionId: string, id: string, state: FilterState): Promise<void>;
  delete(sessionId: string, id: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
  create(sessionId: string, state: Omit<FilterState, "filterId"> & { filterId?: string }, alias?: string): Promise<string>;
  getAlias(sessionId: string, alias: string): Promise<string | null>;
  setAlias(sessionId: string, alias: string, targetId: string): Promise<void>;
  deleteAlias(sessionId: string, alias: string): Promise<void>;
  listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>>;
}

// Persistent store — keyed by (id, scope). No TTL.
export type PersistedFilterState = Omit<FilterState, "schema_snapshot"> & {
  tags: string[];
  description: string;
  schema_snapshot: string;   // JSON-serialized public TableSchema, pinned at init()
};

export interface PersistentFilterStore {
  get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null>;
  set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void>;
  delete(id: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]>;
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>>;
}

// Object stores follow the same pattern
export type PersistedObjectState = ObjectState & {
  tags: string[];
  description: string;
  schema_pinned_at: string;
};

export interface SessionObjectStore {
  get(sessionId: string, id: string): Promise<ObjectState | null>;
  set(sessionId: string, id: string, state: ObjectState): Promise<void>;
  delete(sessionId: string, id: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
  create(sessionId: string, state: Omit<ObjectState, "objectId"> & { objectId?: string }, alias?: string): Promise<string>;
  getAlias(sessionId: string, alias: string): Promise<string | null>;
  setAlias(sessionId: string, alias: string, targetId: string): Promise<void>;
  deleteAlias(sessionId: string, alias: string): Promise<void>;
  listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>>;
}

export interface PersistentObjectStore {
  get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null>;
  set(id: string, state: PersistedObjectState, scope: OwnerScope): Promise<void>;
  delete(id: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedObjectState[]>;
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedObjectState & { scope: OwnerScope }>>;
}

// Event storage interfaces
import type { EventCommit } from "../../middleware/event/types";

export interface SessionEventStore {
  get(sessionId: string, commitId: string): Promise<EventCommit | null>;
  set(sessionId: string, commitId: string, state: EventCommit): Promise<void>;
  delete(sessionId: string, commitId: string): Promise<void>;
  listSession(sessionId: string): Promise<string[]>;
  listChildren(sessionId: string, parentId: string): Promise<string[]>;
  expireSession(sessionId: string, olderThanMs?: number): Promise<void>;
  create(sessionId: string, state: Omit<EventCommit, "commitId"> & { commitId?: string }, alias?: string): Promise<string>;
  getAlias(sessionId: string, alias: string): Promise<string | null>;
  setAlias(sessionId: string, alias: string, targetId: string): Promise<void>;
  deleteAlias(sessionId: string, alias: string): Promise<void>;
  listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>>;
}

export type PersistedEventState = EventCommit & {
  tags: string[];
  description: string;
  schema_name: string;
};

export interface PersistentEventStore {
  get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null>;
  set(commitId: string, state: PersistedEventState, scope: OwnerScope): Promise<void>;
  delete(commitId: string, scope: OwnerScope): Promise<void>;
  findByTag(tag: string, scope: OwnerScope): Promise<PersistedEventState[]>;
  list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedEventState & { scope: OwnerScope }>>;
}
