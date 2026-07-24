import * as crypto from "crypto";
import type { OwnerScope } from "../../../config/types";
import type { KvBackend } from "./backend";
import type { SimpleEntityConfig } from "./entity-config";

export class GenericSimpleEntityStore<Session, Persistent> {
  constructor(
    private backend: KvBackend,
    private config: SimpleEntityConfig<Session, Persistent>,
  ) {}

  private newId(): string {
    return `${this.config.idPrefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  async create(
    sessionId: string,
    state: any,
    alias?: string,
  ): Promise<string> {
    const id = this.newId();
    const fullState = { ...state, [this.config.idField]: id };
    await this.setSession(sessionId, id, fullState as Session);
    if (alias) {
      await this.setAlias(sessionId, alias, id);
    }
    return id;
  }

  async getSession(sessionId: string, id: string): Promise<Session | null> {
    const state = await this.backend.getSessionState(sessionId, id);
    return state as Session | null;
  }

  async setSession(sessionId: string, id: string, state: Session): Promise<void> {
    await this.backend.setSessionState(sessionId, id, state as any);
  }

  async deleteSession(sessionId: string, id: string): Promise<void> {
    await this.backend.deleteSessionState(sessionId, id);
  }

  async listSession(sessionId: string): Promise<string[]> {
    return this.backend.listSessionIds(sessionId);
  }

  async listChildren(sessionId: string, parentId: string): Promise<string[]> {
    if (!this.config.parentIdField) return [];
    const ids: string[] = [];
    for await (const state of this.backend.scanSessionStates(sessionId)) {
      if ((state as any)[this.config.parentIdField] === parentId) {
        ids.push((state as any)[this.config.idField]);
      }
    }
    return ids;
  }

  async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
    const now = Date.now();
    for await (const state of this.backend.scanSessionStates(sessionId)) {
      const id = (state as any)[this.config.idField];
      if (olderThanMs === undefined) {
        await this.backend.deleteSessionState(sessionId, id);
      } else {
        const ts = this.config.parseTimestamp(
          (state as any)[this.config.timestampField],
        );
        if (now - ts > olderThanMs) {
          await this.backend.deleteSessionState(sessionId, id);
        }
      }
    }
  }

  async getPersistent(
    id: string,
    scope: OwnerScope,
  ): Promise<Persistent | null> {
    const state = await this.backend.getPersistentState(id, scope);
    return state as Persistent | null;
  }

  async setPersistent(
    id: string,
    state: Persistent,
    scope: OwnerScope,
  ): Promise<void> {
    await this.backend.setPersistentState(id, scope, state as any);
  }

  async deletePersistent(id: string, scope: OwnerScope): Promise<void> {
    await this.backend.deletePersistentState(id, scope);
  }

  async findByTag(tag: string, scope: OwnerScope): Promise<Persistent[]> {
    const results: Persistent[] = [];
    for await (const state of this.backend.scanPersistentStates(scope)) {
      if ((state as any)[this.config.tagsField]?.includes(tag)) {
        results.push(state as Persistent);
      }
    }
    return results;
  }

  async list(
    scope: OwnerScope,
    includeGlobal?: boolean,
  ): Promise<Array<Persistent & { scope: OwnerScope }>> {
    const results: Array<Persistent & { scope: OwnerScope }> = [];
    for await (const state of this.backend.scanPersistentStates(
      scope,
      includeGlobal,
    )) {
      results.push(state as any);
    }
    return results;
  }

  getAlias(sessionId: string, alias: string): Promise<string | null> {
    return this.backend.getAlias(sessionId, alias);
  }

  setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
    return this.backend.setAlias(sessionId, alias, targetId);
  }

  deleteAlias(sessionId: string, alias: string): Promise<void> {
    return this.backend.deleteAlias(sessionId, alias);
  }

  listAliases(
    sessionId: string,
  ): Promise<Array<{ alias: string; targetId: string }>> {
    return this.backend.listAliases(sessionId);
  }
}