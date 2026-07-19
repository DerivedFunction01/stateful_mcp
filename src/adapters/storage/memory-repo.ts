import type { OwnerScope } from "../../config/types";
import type { FilterState } from "../../middleware/filter/types";
import type { ObjectState } from "../../middleware/object/types";
import type { EventCommit } from "../../middleware/event/types";
import type {
  SessionFilterStore,
  PersistentFilterStore,
  PersistedFilterState,
  SessionObjectStore,
  PersistentObjectStore,
  PersistedObjectState,
  SessionEventStore,
  PersistentEventStore,
  PersistedEventState,
} from "./interfaces";
import { registerAdapter } from "../../config/loader";
import * as crypto from "crypto";

// ── In-Memory Session Filter Store ───────────────────────────────────────────
export class MemorySessionFilterStore implements SessionFilterStore {
  // Key: `${sessionId}:${id}`
  private store = new Map<string, FilterState>();
  private aliases = new Map<string, string>();

  async getAlias(sessionId: string, alias: string): Promise<string | null> {
    const key = `${sessionId}:${alias}`;
    return this.aliases.get(key) || null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.set(key, targetId);
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.delete(key);
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const prefix = `${sessionId}:`;
    const results: Array<{ alias: string; targetId: string }> = [];
    for (const [key, targetId] of this.aliases.entries()) {
      if (key.startsWith(prefix)) {
        results.push({ alias: key.slice(prefix.length), targetId });
      }
    }
    return results;
  }

  async create(sessionId: string, state: Omit<FilterState, "filterId"> & { filterId?: string }, alias?: string): Promise<string> {
    const id = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullState: FilterState = { ...state, filterId: id };
    await this.set(sessionId, id, fullState);
    if (alias) {
      await this.setAlias(sessionId, alias, id);
    }
    return id;
  }

  async get(sessionId: string, id: string): Promise<FilterState | null> {
    const key = `${sessionId}:${id}`;
    return this.store.get(key) || null;
  }

  async set(sessionId: string, id: string, state: FilterState): Promise<void> {
    const key = `${sessionId}:${id}`;
    this.store.set(key, { ...state });
  }

  async delete(sessionId: string, id: string): Promise<void> {
    const key = `${sessionId}:${id}`;
    this.store.delete(key);
  }

  async listSession(sessionId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const ids: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        ids.push(key.slice(prefix.length));
      }
    }
    return ids;
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const ids: string[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(prefix) && state.parentFilterId === parentId) {
        ids.push(state.filterId);
      }
    }
    return ids;
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    const prefix = `${sessionId}:`;
    const now = Date.now();
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        if (olderThanMs !== undefined) {
          const createdTime = new Date(state.createdAt).getTime();
          if (now - createdTime > olderThanMs) {
            this.store.delete(key);
          }
        } else {
          this.store.delete(key);
        }
      }
    }
  }
}

// ── In-Memory Persistent Filter Store ─────────────────────────────────────────
export class MemoryPersistentFilterStore implements PersistentFilterStore {
  // Key: `${level}:${userId || "global"}:${id}`
  private store = new Map<string, PersistedFilterState>();

  private getScopeKey(id: string, scope: OwnerScope): string {
    const scopeId = scope.level === "user" ? scope.userId : "global";
    return `${scope.level}:${scopeId}:${id}`;
  }

  async get(id: string, scope: OwnerScope): Promise<PersistedFilterState | null> {
    const key = this.getScopeKey(id, scope);
    return this.store.get(key) || null;
  }

  async set(id: string, state: PersistedFilterState, scope: OwnerScope): Promise<void> {
    const key = this.getScopeKey(id, scope);
    this.store.set(key, { ...state });
  }

  async delete(id: string, scope: OwnerScope): Promise<void> {
    const key = this.getScopeKey(id, scope);
    this.store.delete(key);
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedFilterState[]> {
    const targetPrefix = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:`;
    const results: PersistedFilterState[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(targetPrefix) && state.tags.includes(tag)) {
        results.push({ ...state });
      }
    }
    return results;
  }

  async list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
    const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
    const globalPrefix = `global:global:`;

    const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
    for (const [key, state] of this.store.entries()) {
      if (scope.level === "user" && key.startsWith(userPrefix)) {
        results.push({ ...state, scope });
      } else if (key.startsWith(globalPrefix)) {
        if (scope.level === "global" || includeGlobal) {
          results.push({ ...state, scope: { level: "global" } });
        }
      }
    }
    return results;
  }
}

// ── In-Memory Session Object Store ───────────────────────────────────────────
export class MemorySessionObjectStore implements SessionObjectStore {
  // Key: `${sessionId}:${id}`
  private store = new Map<string, ObjectState>();
  private aliases = new Map<string, string>();

  async getAlias(sessionId: string, alias: string): Promise<string | null> {
    const key = `${sessionId}:${alias}`;
    return this.aliases.get(key) || null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.set(key, targetId);
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.delete(key);
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const prefix = `${sessionId}:`;
    const results: Array<{ alias: string; targetId: string }> = [];
    for (const [key, targetId] of this.aliases.entries()) {
      if (key.startsWith(prefix)) {
        results.push({ alias: key.slice(prefix.length), targetId });
      }
    }
    return results;
  }

  async create(sessionId: string, state: Omit<ObjectState, "objectId"> & { objectId?: string }, alias?: string): Promise<string> {
    const id = `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullState: ObjectState = { ...state, objectId: id };
    await this.set(sessionId, id, fullState);
    if (alias) {
      await this.setAlias(sessionId, alias, id);
    }
    return id;
  }

  async get(sessionId: string, id: string): Promise<ObjectState | null> {
    const key = `${sessionId}:${id}`;
    return this.store.get(key) || null;
  }

  async set(sessionId: string, id: string, state: ObjectState): Promise<void> {
    const key = `${sessionId}:${id}`;
    this.store.set(key, { ...state });
  }

  async delete(sessionId: string, id: string): Promise<void> {
    const key = `${sessionId}:${id}`;
    this.store.delete(key);
  }

  async listSession(sessionId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const ids: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        ids.push(key.slice(prefix.length));
      }
    }
    return ids;
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const ids: string[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(prefix) && state.parentObjectId === parentId) {
        ids.push(state.objectId);
      }
    }
    return ids;
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    const prefix = `${sessionId}:`;
    const now = Date.now();
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        if (olderThanMs !== undefined) {
          const createdTime = new Date(state.createdAt).getTime();
          if (now - createdTime > olderThanMs) {
            this.store.delete(key);
          }
        } else {
          this.store.delete(key);
        }
      }
    }
  }
}

// ── In-Memory Persistent Object Store ─────────────────────────────────────────
export class MemoryPersistentObjectStore implements PersistentObjectStore {
  // Key: `${level}:${userId || "global"}:${id}`
  private store = new Map<string, PersistedObjectState>();

  private getScopeKey(id: string, scope: OwnerScope): string {
    const scopeId = scope.level === "user" ? scope.userId : "global";
    return `${scope.level}:${scopeId}:${id}`;
  }

  async get(id: string, scope: OwnerScope): Promise<PersistedObjectState | null> {
    const key = this.getScopeKey(id, scope);
    return this.store.get(key) || null;
  }

  async set(id: string, state: PersistedObjectState, scope: OwnerScope): Promise<void> {
    const key = this.getScopeKey(id, scope);
    this.store.set(key, { ...state });
  }

  async delete(id: string, scope: OwnerScope): Promise<void> {
    const key = this.getScopeKey(id, scope);
    this.store.delete(key);
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedObjectState[]> {
    const targetPrefix = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:`;
    const results: PersistedObjectState[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(targetPrefix) && state.tags.includes(tag)) {
        results.push({ ...state });
      }
    }
    return results;
  }

  async list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
    const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
    const globalPrefix = `global:global:`;

    const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
    for (const [key, state] of this.store.entries()) {
      if (scope.level === "user" && key.startsWith(userPrefix)) {
        results.push({ ...state, scope });
      } else if (key.startsWith(globalPrefix)) {
        if (scope.level === "global" || includeGlobal) {
          results.push({ ...state, scope: { level: "global" } });
        }
      }
    }
    return results;
  }
}

// ── In-Memory Session Event Store ─────────────────────────────────────────────
export class MemorySessionEventStore implements SessionEventStore {
  private store = new Map<string, EventCommit>();
  private aliases = new Map<string, string>();

  async getAlias(sessionId: string, alias: string): Promise<string | null> {
    const key = `${sessionId}:${alias}`;
    return this.aliases.get(key) || null;
  }

  async setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.set(key, targetId);
  }

  async deleteAlias(sessionId: string, alias: string): Promise<void> {
    const key = `${sessionId}:${alias}`;
    this.aliases.delete(key);
  }

  async listAliases(sessionId: string): Promise<Array<{ alias: string; targetId: string }>> {
    const prefix = `${sessionId}:`;
    const results: Array<{ alias: string; targetId: string }> = [];
    for (const [key, targetId] of this.aliases.entries()) {
      if (key.startsWith(prefix)) {
        results.push({ alias: key.slice(prefix.length), targetId });
      }
    }
    return results;
  }

  async get(sessionId: string, commitId: string): Promise<EventCommit | null> {
    const resolvedId = await this.getAlias(sessionId, commitId) || commitId;
    const key = `${sessionId}:${resolvedId}`;
    return this.store.get(key) || null;
  }

  async set(sessionId: string, commitId: string, state: EventCommit): Promise<void> {
    const key = `${sessionId}:${commitId}`;
    this.store.set(key, { ...state });
  }

  async delete(sessionId: string, commitId: string): Promise<void> {
    const key = `${sessionId}:${commitId}`;
    this.store.delete(key);
  }

  async listSession(sessionId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const results: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        results.push(key.slice(prefix.length));
      }
    }
    return results;
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    const prefix = `${sessionId}:`;
    const results: string[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(prefix) && state.parentCommitId === parentId) {
        results.push(state.commitId);
      }
    }
    return results;
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    const prefix = `${sessionId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    for (const key of this.aliases.keys()) {
      if (key.startsWith(prefix)) {
        this.aliases.delete(key);
      }
    }
  }

  async create(sessionId: string, state: Omit<EventCommit, "commitId"> & { commitId?: string }, alias?: string): Promise<string> {
    const commitId = state.commitId || `commit_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullState = { ...state, commitId } as EventCommit;
    await this.set(sessionId, commitId, fullState);
    if (alias) {
      await this.setAlias(sessionId, alias, commitId);
    }
    return commitId;
  }
}

// ── In-Memory Persistent Event Store ──────────────────────────────────────────
export class MemoryPersistentEventStore implements PersistentEventStore {
  private store = new Map<string, PersistedEventState>();

  async get(commitId: string, scope: OwnerScope): Promise<PersistedEventState | null> {
    const prefix = scope.level === "user" ? `user:${scope.userId}:` : "global:global:";
    const key = `${prefix}${commitId}`;
    return this.store.get(key) || null;
  }

  async set(commitId: string, state: PersistedEventState, scope: OwnerScope): Promise<void> {
    const prefix = scope.level === "user" ? `user:${scope.userId}:` : "global:global:";
    const key = `${prefix}${commitId}`;
    this.store.set(key, { ...state });
  }

  async delete(commitId: string, scope: OwnerScope): Promise<void> {
    const prefix = scope.level === "user" ? `user:${scope.userId}:` : "global:global:";
    const key = `${prefix}${commitId}`;
    this.store.delete(key);
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<PersistedEventState[]> {
    const targetPrefix = scope.level === "user" ? `user:${scope.userId}:` : "global:global:";
    const results: PersistedEventState[] = [];
    for (const [key, state] of this.store.entries()) {
      if (key.startsWith(targetPrefix) && state.tags.includes(tag)) {
        results.push({ ...state });
      }
    }
    return results;
  }

  async list(
    scope: OwnerScope,
    includeGlobal?: boolean
  ): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
    const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
    const globalPrefix = `global:global:`;

    const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
    for (const [key, state] of this.store.entries()) {
      if (scope.level === "user" && key.startsWith(userPrefix)) {
        results.push({ ...state, scope });
      } else if (key.startsWith(globalPrefix)) {
        if (scope.level === "global" || includeGlobal) {
          results.push({ ...state, scope: { level: "global" } });
        }
      }
    }
    return results;
  }
}

// ── Registry Registration ───────────────────────────────────────────────────

registerAdapter("memory", {
  create: async (options) => {
    return {
      sessionFilter: new MemorySessionFilterStore(),
      persistentFilter: new MemoryPersistentFilterStore(),
      sessionObject: new MemorySessionObjectStore(),
      persistentObject: new MemoryPersistentObjectStore(),
      sessionEvent: new MemorySessionEventStore(),
      persistentEvent: new MemoryPersistentEventStore(),
    };
  }
});
