import type { OwnerScope } from "../config/types";
import type { SyncRecord } from "./contracts";

export interface ScopedRecord {
	id: string;
	sessionId?: string;
	updatedAt?: string;
	[key: string]: unknown;
}

export interface ScopedStoreOptions {
	ttlMs?: number;
	syncEnabled?: boolean;
	sourceId?: string;
	domain?: string;
}

/**
 * Small backend-neutral scope boundary used by adapters and tests. Session data
 * is never mixed with global/user data and is excluded from sync by default.
 */
export class InMemoryScopedStore<T extends ScopedRecord> {
	private persistent = new Map<string, T>();
	private sessions = new Map<
		string,
		Map<string, { value: T; expiresAt?: number }>
	>();

	constructor(private options: ScopedStoreOptions = {}) {}

	async set(value: T, scope: OwnerScope, sessionId?: string): Promise<void> {
		if (!sessionId && (scope.level === "global" || scope.level === "user")) {
			this.persistent.set(this.persistentKey(scope, value.id), value);
			return;
		}
		if (!sessionId)
			throw new Error("sessionId is required for session-scoped records");
		let records = this.sessions.get(sessionId);
		if (!records) {
			records = new Map();
			this.sessions.set(sessionId, records);
		}
		records.set(value.id, {
			value: { ...value, sessionId },
			expiresAt: this.expiry(),
		});
	}

	async get(
		id: string,
		scope: OwnerScope,
		sessionId?: string,
	): Promise<T | null> {
		if (!sessionId && (scope.level === "global" || scope.level === "user"))
			return this.persistent.get(this.persistentKey(scope, id)) ?? null;
		if (!sessionId) return null;
		const record = this.sessions.get(sessionId)?.get(id);
		if (!record) return null;
		if (record.expiresAt !== undefined && record.expiresAt <= Date.now()) {
			this.sessions.get(sessionId)?.delete(id);
			return null;
		}
		return record.value;
	}

	async delete(
		id: string,
		scope: OwnerScope,
		sessionId?: string,
	): Promise<void> {
		if (!sessionId && (scope.level === "global" || scope.level === "user"))
			this.persistent.delete(this.persistentKey(scope, id));
		else if (sessionId) this.sessions.get(sessionId)?.delete(id);
	}

	cleanupExpired(now = Date.now()): number {
		let removed = 0;
		for (const records of this.sessions.values())
			for (const [id, record] of records) {
				if (record.expiresAt !== undefined && record.expiresAt <= now) {
					records.delete(id);
					removed++;
				}
			}
		return removed;
	}

	async syncRecords(now = new Date().toISOString()): Promise<SyncRecord[]> {
		this.cleanupExpired();
		const records: SyncRecord[] = [];
		for (const [key, value] of this.persistent)
			records.push(this.syncRecord(key, value, now));
		if (this.options.syncEnabled)
			for (const [sessionId, values] of this.sessions)
				for (const [id, record] of values) {
					if (record.expiresAt !== undefined && record.expiresAt <= Date.now())
						continue;
					records.push(
						this.syncRecord(`${sessionId}:${id}`, record.value, now, sessionId),
					);
				}
		return records;
	}

	private persistentKey(scope: OwnerScope, id: string): string {
		return `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
	}
	private expiry(): number | undefined {
		return this.options.ttlMs === undefined
			? undefined
			: Date.now() + this.options.ttlMs;
	}
	private syncRecord(
		recordId: string,
		value: T,
		occurredAt: string,
		sessionId?: string,
	): SyncRecord {
		return {
			sourceId: this.options.sourceId ?? "local",
			domain: this.options.domain ?? "state",
			recordId,
			operation: "upsert",
			revision: value.updatedAt ?? occurredAt,
			occurredAt,
			scope: sessionId ? undefined : { level: "global" },
			payload: sessionId ? { ...value, sessionId } : value,
		};
	}
}
