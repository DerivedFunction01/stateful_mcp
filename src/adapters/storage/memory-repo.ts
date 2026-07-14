import type { OwnerScope } from "../../config/types";
import type { FilterState } from "../../middleware/filter/types";
import type { ObjectState } from "../../middleware/object/types";
import type {
  SessionFilterStore,
  PersistentFilterStore,
  PersistedFilterState,
  SessionObjectStore,
  PersistentObjectStore,
  PersistedObjectState,
} from "./interfaces";
import { registerAdapter } from "../../config/loader";

// ── In-Memory Session Filter Store ───────────────────────────────────────────
export class MemorySessionFilterStore implements SessionFilterStore {
  // Key: `${sessionId}:${id}`
  private store = new Map<string, FilterState>();

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

// ── Registry Registration ───────────────────────────────────────────────────

registerAdapter("memory", {
  create: async (options) => {
    // Return a single object hosting all memory storage instances
    // or instantiate them as requested. For simplification, we return a new
    // adapter instance container based on what context/options request,
    // or return a multi-purpose object.
    return {
      sessionFilter: new MemorySessionFilterStore(),
      persistentFilter: new MemoryPersistentFilterStore(),
      sessionObject: new MemorySessionObjectStore(),
      persistentObject: new MemoryPersistentObjectStore(),
    };
  }
});
