import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import type { OwnerScope } from "../../config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../middleware/dictionary/interfaces";
import type {
	Concept,
	ConceptRelation,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "../../middleware/dictionary/types";
import { invertRelationType } from "../../middleware/dictionary/types";
import type { EventCommit } from "../../middleware/event/types";
import type { FilterState } from "../../middleware/filter/types";
import type { FormState } from "../../middleware/form/types";
import type { ObjectState } from "../../middleware/object/types";
import type {
	PersistedEventState,
	PersistedFilterState,
	PersistedFormStateDetails,
	PersistedObjectState,
	PersistentEventStore,
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	SessionEventStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
} from "./interfaces";

// Helper to ensure parent directories exist
async function ensureDir(filePath: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
}

// Helper to check if a directory has write permissions or file exists
async function fileOrDirExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

// ── Base JSONL Store ──────────────────────────────────────────────────────────
class BaseJsonlStore {
	protected initialized = false;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(protected filePath: string) {}

	protected async enqueueWrite(fn: () => Promise<void>): Promise<void> {
		this.writeQueue = this.writeQueue.then(fn).catch((err) => {
			console.error(`JSONL write error in ${this.filePath}:`, err);
		});
		return this.writeQueue;
	}

	protected async appendLine(line: string): Promise<void> {
		await this.enqueueWrite(async () => {
			await ensureDir(this.filePath);
			await fs.appendFile(this.filePath, line + "\n", "utf-8");
		});
	}

	protected async truncateAndWrite(lines: string[]): Promise<void> {
		await this.enqueueWrite(async () => {
			await ensureDir(this.filePath);
			await fs.writeFile(
				this.filePath,
				lines.join("\n") + (lines.length > 0 ? "\n" : ""),
				"utf-8",
			);
		});
	}
}

// ── JSONL Session Filter Store ───────────────────────────────────────────────
export class JsonlSessionFilterStore
	extends BaseJsonlStore
	implements SessionFilterStore
{
	private states = new Map<string, FilterState>();
	private aliases = new Map<string, string>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.states.set(entry.data.filterId, entry.data);
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(`${entry.sessionId}:${entry.alias}`);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const state of this.states.values()) {
			lines.push(JSON.stringify({ type: "state", data: state }));
		}
		for (const [key, targetId] of this.aliases.entries()) {
			const idx = key.indexOf(":");
			const sessionId = key.slice(0, idx);
			const alias = key.slice(idx + 1);
			lines.push(JSON.stringify({ type: "alias", sessionId, alias, targetId }));
		}
		await this.truncateAndWrite(lines);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		await this.init();
		return this.aliases.get(`${sessionId}:${alias}`) || null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		this.aliases.set(key, targetId);
		await this.appendLine(
			JSON.stringify({ type: "alias", sessionId, alias, targetId }),
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		if (this.aliases.delete(key)) {
			await this.appendLine(
				JSON.stringify({ type: "delete_alias", sessionId, alias }),
			);
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		await this.init();
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async create(
		sessionId: string,
		state: Omit<FilterState, "filterId"> & { filterId?: string },
		alias?: string,
	): Promise<string> {
		await this.init();
		const id = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FilterState = { ...state, filterId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async get(sessionId: string, id: string): Promise<FilterState | null> {
		await this.init();
		return this.states.get(id) || null;
	}

	async set(sessionId: string, id: string, state: FilterState): Promise<void> {
		await this.init();
		this.states.set(id, state);
		await this.appendLine(JSON.stringify({ type: "state", data: state }));
	}

	async delete(sessionId: string, id: string): Promise<void> {
		await this.init();
		if (this.states.delete(id)) {
			await this.serializeAll();
		}
	}

	async listSession(sessionId: string): Promise<string[]> {
		await this.init();
		return Array.from(this.states.keys());
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		await this.init();
		const children: string[] = [];
		for (const state of this.states.values()) {
			if (state.parentFilterId === parentId) {
				children.push(state.filterId);
			}
		}
		return children;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		await this.init();
		this.states.clear();
		this.aliases.clear();
		await this.serializeAll();
	}

	async pruneUnusedStates(sessionId: string, keptIds: string[]): Promise<void> {
		await this.init();
		const kept = new Set(keptIds);
		let changed = false;
		for (const id of this.states.keys()) {
			if (!kept.has(id)) {
				this.states.delete(id);
				changed = true;
			}
		}
		if (changed) {
			await this.serializeAll();
		}
	}
}

// ── JSONL Persistent Filter Store ────────────────────────────────────────────
export class JsonlPersistentFilterStore
	extends BaseJsonlStore
	implements PersistentFilterStore
{
	private states = new Map<
		string,
		PersistedFilterState & { scope: OwnerScope }
	>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "persistent_state") {
						this.states.set(entry.id, entry.data);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const [id, data] of this.states.entries()) {
			lines.push(JSON.stringify({ type: "persistent_state", id, data }));
		}
		await this.truncateAndWrite(lines);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState | null> {
		await this.init();
		const record = this.states.get(id);
		if (!record) return null;
		if (
			record.scope.level === "global" ||
			(scope.level === "user" && record.scope.userId === scope.userId)
		) {
			return record;
		}
		return null;
	}

	async set(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void> {
		await this.init();
		const data = { ...state, scope };
		this.states.set(id, data);
		await this.appendLine(
			JSON.stringify({ type: "persistent_state", id, data }),
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.init();
		if (this.states.delete(id)) {
			await this.serializeAll();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState[]> {
		await this.init();
		const results: PersistedFilterState[] = [];
		for (const record of this.states.values()) {
			if (record.tags.includes(tag)) {
				if (
					record.scope.level === "global" ||
					(scope.level === "user" && record.scope.userId === scope.userId)
				) {
					results.push(record);
				}
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
		await this.init();
		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
		for (const record of this.states.values()) {
			if (
				(record.scope.level === "user" &&
					scope.level === "user" &&
					record.scope.userId === scope.userId) ||
				(includeGlobal && record.scope.level === "global")
			) {
				results.push(record);
			}
		}
		return results;
	}
}

// ── JSONL Session Object Store ───────────────────────────────────────────────
export class JsonlSessionObjectStore
	extends BaseJsonlStore
	implements SessionObjectStore
{
	private states = new Map<string, ObjectState>();
	private aliases = new Map<string, string>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.states.set(entry.data.objectId, entry.data);
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(`${entry.sessionId}:${entry.alias}`);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const state of this.states.values()) {
			lines.push(JSON.stringify({ type: "state", data: state }));
		}
		for (const [key, targetId] of this.aliases.entries()) {
			const idx = key.indexOf(":");
			const sessionId = key.slice(0, idx);
			const alias = key.slice(idx + 1);
			lines.push(JSON.stringify({ type: "alias", sessionId, alias, targetId }));
		}
		await this.truncateAndWrite(lines);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		await this.init();
		return this.aliases.get(`${sessionId}:${alias}`) || null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		this.aliases.set(key, targetId);
		await this.appendLine(
			JSON.stringify({ type: "alias", sessionId, alias, targetId }),
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		if (this.aliases.delete(key)) {
			await this.appendLine(
				JSON.stringify({ type: "delete_alias", sessionId, alias }),
			);
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		await this.init();
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async create(
		sessionId: string,
		state: Omit<ObjectState, "objectId"> & { objectId?: string },
		alias?: string,
	): Promise<string> {
		await this.init();
		const id = `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: ObjectState = { ...state, objectId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async get(sessionId: string, id: string): Promise<ObjectState | null> {
		await this.init();
		return this.states.get(id) || null;
	}

	async set(sessionId: string, id: string, state: ObjectState): Promise<void> {
		await this.init();
		this.states.set(id, state);
		await this.appendLine(JSON.stringify({ type: "state", data: state }));
	}

	async delete(sessionId: string, id: string): Promise<void> {
		await this.init();
		if (this.states.delete(id)) {
			await this.serializeAll();
		}
	}

	async listSession(sessionId: string): Promise<string[]> {
		await this.init();
		return Array.from(this.states.keys());
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		await this.init();
		const children: string[] = [];
		for (const state of this.states.values()) {
			if (state.parentObjectId === parentId) {
				children.push(state.objectId);
			}
		}
		return children;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		await this.init();
		this.states.clear();
		this.aliases.clear();
		await this.serializeAll();
	}

	async pruneUnusedStates(sessionId: string, keptIds: string[]): Promise<void> {
		await this.init();
		const kept = new Set(keptIds);
		let changed = false;
		for (const id of this.states.keys()) {
			if (!kept.has(id)) {
				this.states.delete(id);
				changed = true;
			}
		}
		if (changed) {
			await this.serializeAll();
		}
	}
}

// ── JSONL Persistent Object Store ────────────────────────────────────────────
export class JsonlPersistentObjectStore
	extends BaseJsonlStore
	implements PersistentObjectStore
{
	private states = new Map<
		string,
		PersistedObjectState & { scope: OwnerScope }
	>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "persistent_state") {
						this.states.set(entry.id, entry.data);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const [id, data] of this.states.entries()) {
			lines.push(JSON.stringify({ type: "persistent_state", id, data }));
		}
		await this.truncateAndWrite(lines);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState | null> {
		await this.init();
		const record = this.states.get(id);
		if (!record) return null;
		if (
			record.scope.level === "global" ||
			(scope.level === "user" && record.scope.userId === scope.userId)
		) {
			return record;
		}
		return null;
	}

	async set(
		id: string,
		state: PersistedObjectState,
		scope: OwnerScope,
	): Promise<void> {
		await this.init();
		const data = { ...state, scope };
		this.states.set(id, data);
		await this.appendLine(
			JSON.stringify({ type: "persistent_state", id, data }),
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.init();
		if (this.states.delete(id)) {
			await this.serializeAll();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState[]> {
		await this.init();
		const results: PersistedObjectState[] = [];
		for (const record of this.states.values()) {
			if (record.tags.includes(tag)) {
				if (
					record.scope.level === "global" ||
					(scope.level === "user" && record.scope.userId === scope.userId)
				) {
					results.push(record);
				}
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
		await this.init();
		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
		for (const record of this.states.values()) {
			if (
				(record.scope.level === "user" &&
					scope.level === "user" &&
					record.scope.userId === scope.userId) ||
				(includeGlobal && record.scope.level === "global")
			) {
				results.push(record);
			}
		}
		return results;
	}
}

// ── JSONL Session Event Store ────────────────────────────────────────────────
export class JsonlSessionEventStore
	extends BaseJsonlStore
	implements SessionEventStore
{
	private commits = new Map<string, EventCommit>();
	private aliases = new Map<string, string>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.commits.set(entry.data.commitId, entry.data);
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(`${entry.sessionId}:${entry.alias}`);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const commit of this.commits.values()) {
			lines.push(JSON.stringify({ type: "state", data: commit }));
		}
		for (const [key, targetId] of this.aliases.entries()) {
			const idx = key.indexOf(":");
			const sessionId = key.slice(0, idx);
			const alias = key.slice(idx + 1);
			lines.push(JSON.stringify({ type: "alias", sessionId, alias, targetId }));
		}
		await this.truncateAndWrite(lines);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		await this.init();
		return this.aliases.get(`${sessionId}:${alias}`) || null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		this.aliases.set(key, targetId);
		await this.appendLine(
			JSON.stringify({ type: "alias", sessionId, alias, targetId }),
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		if (this.aliases.delete(key)) {
			await this.appendLine(
				JSON.stringify({ type: "delete_alias", sessionId, alias }),
			);
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		await this.init();
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async create(
		sessionId: string,
		state: Omit<EventCommit, "commitId"> & { commitId?: string },
		alias?: string,
	): Promise<string> {
		await this.init();
		const id = `commit_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: EventCommit = { ...state, commitId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async get(sessionId: string, commitId: string): Promise<EventCommit | null> {
		await this.init();
		return this.commits.get(commitId) || null;
	}

	async set(
		sessionId: string,
		commitId: string,
		commit: EventCommit,
	): Promise<void> {
		await this.init();
		this.commits.set(commitId, commit);
		await this.appendLine(JSON.stringify({ type: "state", data: commit }));
	}

	async delete(sessionId: string, commitId: string): Promise<void> {
		await this.init();
		if (this.commits.delete(commitId)) {
			await this.serializeAll();
		}
	}

	async listSession(sessionId: string): Promise<string[]> {
		await this.init();
		return Array.from(this.commits.keys());
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		await this.init();
		const children: string[] = [];
		for (const commit of this.commits.values()) {
			if (commit.parentCommitId === parentId) {
				children.push(commit.commitId);
			}
		}
		return children;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		await this.init();
		this.commits.clear();
		this.aliases.clear();
		await this.serializeAll();
	}

	async pruneUnusedStates(sessionId: string, keptIds: string[]): Promise<void> {
		await this.init();
		const kept = new Set(keptIds);
		let changed = false;
		for (const id of this.commits.keys()) {
			if (!kept.has(id)) {
				this.commits.delete(id);
				changed = true;
			}
		}
		if (changed) {
			await this.serializeAll();
		}
	}
}

// ── JSONL Persistent Event Store ─────────────────────────────────────────────
export class JsonlPersistentEventStore
	extends BaseJsonlStore
	implements PersistentEventStore
{
	private commits = new Map<
		string,
		PersistedEventState & { scope: OwnerScope }
	>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "persistent_state") {
						this.commits.set(entry.id, entry.data);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const [id, data] of this.commits.entries()) {
			lines.push(JSON.stringify({ type: "persistent_state", id, data }));
		}
		await this.truncateAndWrite(lines);
	}

	async get(
		commitId: string,
		scope: OwnerScope,
	): Promise<PersistedEventState | null> {
		await this.init();
		const record = this.commits.get(commitId);
		if (!record) return null;
		if (
			record.scope.level === "global" ||
			(scope.level === "user" && record.scope.userId === scope.userId)
		) {
			return record;
		}
		return null;
	}

	async set(
		commitId: string,
		state: PersistedEventState,
		scope: OwnerScope,
	): Promise<void> {
		await this.init();
		const data = { ...state, scope };
		this.commits.set(commitId, data);
		await this.appendLine(
			JSON.stringify({ type: "persistent_state", id: commitId, data }),
		);
	}

	async delete(commitId: string, scope: OwnerScope): Promise<void> {
		await this.init();
		if (this.commits.delete(commitId)) {
			await this.serializeAll();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedEventState[]> {
		await this.init();
		const results: PersistedEventState[] = [];
		for (const record of this.commits.values()) {
			if (record.tags.includes(tag)) {
				if (
					record.scope.level === "global" ||
					(scope.level === "user" && record.scope.userId === scope.userId)
				) {
					results.push(record);
				}
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedEventState & { scope: OwnerScope }>> {
		await this.init();
		const results: Array<PersistedEventState & { scope: OwnerScope }> = [];
		for (const record of this.commits.values()) {
			if (
				(record.scope.level === "user" &&
					scope.level === "user" &&
					record.scope.userId === scope.userId) ||
				(includeGlobal && record.scope.level === "global")
			) {
				results.push(record);
			}
		}
		return results;
	}
}

// ── JSONL Session Form Store ─────────────────────────────────────────────────
export class JsonlSessionFormStore
	extends BaseJsonlStore
	implements SessionFormStore
{
	private states = new Map<string, FormState>();
	private aliases = new Map<string, string>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "state") {
						this.states.set(entry.data.formId, entry.data);
					} else if (entry.type === "alias") {
						this.aliases.set(
							`${entry.sessionId}:${entry.alias}`,
							entry.targetId,
						);
					} else if (entry.type === "delete_alias") {
						this.aliases.delete(`${entry.sessionId}:${entry.alias}`);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const state of this.states.values()) {
			lines.push(JSON.stringify({ type: "state", data: state }));
		}
		for (const [key, targetId] of this.aliases.entries()) {
			const idx = key.indexOf(":");
			const sessionId = key.slice(0, idx);
			const alias = key.slice(idx + 1);
			lines.push(JSON.stringify({ type: "alias", sessionId, alias, targetId }));
		}
		await this.truncateAndWrite(lines);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		await this.init();
		return this.aliases.get(`${sessionId}:${alias}`) || null;
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		this.aliases.set(key, targetId);
		await this.appendLine(
			JSON.stringify({ type: "alias", sessionId, alias, targetId }),
		);
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		await this.init();
		const key = `${sessionId}:${alias}`;
		if (this.aliases.delete(key)) {
			await this.appendLine(
				JSON.stringify({ type: "delete_alias", sessionId, alias }),
			);
		}
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		await this.init();
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async create(
		sessionId: string,
		state: Omit<FormState, "formId"> & { formId?: string },
		alias?: string,
	): Promise<string> {
		await this.init();
		const id =
			state.formId ||
			`form_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FormState = { ...state, formId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async get(sessionId: string, id: string): Promise<FormState | null> {
		await this.init();
		return this.states.get(id) || null;
	}

	async set(sessionId: string, id: string, state: FormState): Promise<void> {
		await this.init();
		this.states.set(id, state);
		await this.appendLine(JSON.stringify({ type: "state", data: state }));
	}

	async delete(sessionId: string, id: string): Promise<void> {
		await this.init();
		if (this.states.delete(id)) {
			await this.serializeAll();
		}
	}

	async listSession(sessionId: string): Promise<string[]> {
		await this.init();
		return Array.from(this.states.keys());
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		await this.init();
		const ids: string[] = [];
		for (const state of this.states.values()) {
			if (state.parentFormId === parentId) {
				ids.push(state.formId);
			}
		}
		return ids;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		await this.init();
		if (olderThanMs === undefined) {
			this.states.clear();
			this.aliases.clear();
			await this.serializeAll();
			return;
		}
		const now = Date.now();
		let changed = false;
		for (const [id, state] of this.states.entries()) {
			const t = Date.parse(state.timestamp);
			if (now - t > olderThanMs) {
				this.states.delete(id);
				changed = true;
			}
		}
		const kept = new Set(this.states.keys());
		for (const [key, targetId] of this.aliases.entries()) {
			if (!kept.has(targetId)) {
				this.aliases.delete(key);
				changed = true;
			}
		}
		if (changed) {
			await this.serializeAll();
		}
	}
}

// ── JSONL Persistent Form Store ──────────────────────────────────────────────
export class JsonlPersistentFormStore
	extends BaseJsonlStore
	implements PersistentFormStore
{
	private forms = new Map<
		string,
		PersistedFormStateDetails & { scope: OwnerScope }
	>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "persistent_state") {
						this.forms.set(entry.id, entry.data);
					}
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err;
		}
		this.initialized = true;
	}

	private async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const [id, data] of this.forms.entries()) {
			lines.push(JSON.stringify({ type: "persistent_state", id, data }));
		}
		await this.truncateAndWrite(lines);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails | null> {
		await this.init();
		const record = this.forms.get(id);
		if (!record) return null;
		if (
			record.scope.level === "global" ||
			(scope.level === "user" && record.scope.userId === scope.userId)
		) {
			return record;
		}
		return null;
	}

	async set(
		id: string,
		state: PersistedFormStateDetails,
		scope: OwnerScope,
	): Promise<void> {
		await this.init();
		const data = { ...state, scope };
		this.forms.set(id, data);
		await this.appendLine(
			JSON.stringify({ type: "persistent_state", id, data }),
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.init();
		if (this.forms.delete(id)) {
			await this.serializeAll();
		}
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails[]> {
		await this.init();
		const results: PersistedFormStateDetails[] = [];
		for (const record of this.forms.values()) {
			if (record.tags.includes(tag)) {
				if (
					record.scope.level === "global" ||
					(scope.level === "user" && record.scope.userId === scope.userId)
				) {
					results.push(record);
				}
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
		await this.init();
		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
			[];
		for (const record of this.forms.values()) {
			if (
				(record.scope.level === "user" &&
					scope.level === "user" &&
					record.scope.userId === scope.userId) ||
				(includeGlobal && record.scope.level === "global")
			) {
				results.push(record);
			}
		}
		return results;
	}
}

export class JsonlConceptStore extends BaseJsonlStore implements ConceptStore {
	private namespaces = new Map<string, Namespace>();
	private concepts = new Map<string, Concept>();
	private relations: ConceptRelation[] = [];
	private pathCache = new Map<string, any[]>();

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "namespace") {
						this.namespaces.set(entry.data.code, entry.data);
					} else if (entry.type === "concept") {
						this.concepts.set(entry.data.id, entry.data);
					} else if (entry.type === "relation") {
						this.relations.push(entry.data);
					}
				}
			}
		} catch (_) {}
		this.initialized = true;
	}

	async serializeAll(): Promise<void> {
		const lines: string[] = [];
		for (const ns of this.namespaces.values()) {
			lines.push(JSON.stringify({ type: "namespace", data: ns }));
		}
		for (const c of this.concepts.values()) {
			lines.push(JSON.stringify({ type: "concept", data: c }));
		}
		for (const r of this.relations) {
			lines.push(JSON.stringify({ type: "relation", data: r }));
		}
		await this.truncateAndWrite(lines);
	}

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		await this.init();
		const results: Concept[] = [];
		const lowerQuery = query.toLowerCase();
		for (const c of this.concepts.values()) {
			if (namespaceCode && c.namespaceCode !== namespaceCode) continue;
			if (
				c.id.toLowerCase().includes(lowerQuery) ||
				c.standardCode.toLowerCase().includes(lowerQuery) ||
				c.display.toLowerCase().includes(lowerQuery) ||
				(c.description && c.description.toLowerCase().includes(lowerQuery))
			) {
				results.push(c);
			}
			if (results.length >= limit) break;
		}
		return results;
	}

	async getById(id: string): Promise<Concept | null> {
		await this.init();
		return this.concepts.get(id) || null;
	}

	async listNamespaces(): Promise<Namespace[]> {
		await this.init();
		return Array.from(this.namespaces.values());
	}

	async addConcept(concept: Concept): Promise<void> {
		await this.init();
		this.concepts.set(concept.id, concept);
		await this.serializeAll();
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		await this.init();
		this.namespaces.set(namespace.code, namespace);
		await this.serializeAll();
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		await this.init();
		this.relations = this.relations.filter((r) => r.id !== relation.id);
		this.relations.push(relation);
		await this.invalidateRelationCache();
		await this.serializeAll();
	}

	async invalidateRelationCache(conceptId?: string): Promise<void> {
		if (conceptId) {
			this.pathCache.delete(conceptId);
		} else {
			this.pathCache.clear();
		}
	}

	async getRelations(
		conceptId: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
		await this.init();
		return this.relations.filter((r) => {
			if (!r.active) return false;
			if (direction === "forward") return r.conceptId === conceptId;
			if (direction === "reverse") return r.linkedId === conceptId;
			return r.conceptId === conceptId || r.linkedId === conceptId;
		});
	}

	async getRelatedConcepts(
		conceptId: string,
		direction: TraversalDirection = "both",
		maxDepth = 3,
		useCache = true,
	): Promise<RelatedConceptResult[]> {
		await this.init();
		const results: RelatedConceptResult[] = [];
		const visited = new Set<string>();

		const cacheKey = `${conceptId}:${direction}:${maxDepth}`;
		if (useCache && this.pathCache.has(cacheKey)) {
			return this.pathCache.get(cacheKey)! as RelatedConceptResult[];
		}

		const queue: Array<{
			id: string;
			depth: number;
			dir: "forward" | "reverse";
			pathRelType: any;
		}> = [];

		if (direction === "forward" || direction === "both") {
			for (const r of this.relations) {
				if (r.active && r.conceptId === conceptId) {
					queue.push({
						id: r.linkedId,
						depth: 1,
						dir: "forward",
						pathRelType: r.relationshipType,
					});
				}
			}
		}

		if (direction === "reverse" || direction === "both") {
			for (const r of this.relations) {
				if (r.active && r.linkedId === conceptId) {
					queue.push({
						id: r.conceptId,
						depth: 1,
						dir: "reverse",
						pathRelType: invertRelationType(r.relationshipType),
					});
				}
			}
		}

		while (queue.length > 0) {
			const current = queue.shift()!;
			if (
				visited.has(`${current.id}:${current.dir}`) ||
				current.depth > maxDepth
			)
				continue;
			visited.add(`${current.id}:${current.dir}`);

			const concept = await this.getById(current.id);
			if (concept && concept.active !== false) {
				results.push({
					concept,
					relationshipType: current.pathRelType,
					direction: current.dir,
					depth: current.depth,
				});
			}

			if (current.depth < maxDepth) {
				if (current.dir === "forward") {
					for (const r of this.relations) {
						if (r.active && r.conceptId === current.id) {
							const inferredType =
								r.relationshipType === "NARROWER_THAN" ||
								current.pathRelType === "NARROWER_THAN"
									? "NARROWER_THAN"
									: r.relationshipType === "WIDER_THAN" ||
											current.pathRelType === "WIDER_THAN"
										? "WIDER_THAN"
										: "EQUIVALENT";
							queue.push({
								id: r.linkedId,
								depth: current.depth + 1,
								dir: "forward",
								pathRelType: inferredType,
							});
						}
					}
				} else {
					for (const r of this.relations) {
						if (r.active && r.linkedId === current.id) {
							const invType = invertRelationType(r.relationshipType);
							const inferredType =
								invType === "NARROWER_THAN" ||
								current.pathRelType === "NARROWER_THAN"
									? "NARROWER_THAN"
									: invType === "WIDER_THAN" ||
											current.pathRelType === "WIDER_THAN"
										? "WIDER_THAN"
										: "EQUIVALENT";
							queue.push({
								id: r.conceptId,
								depth: current.depth + 1,
								dir: "reverse",
								pathRelType: inferredType,
							});
						}
					}
				}
			}
		}

		if (useCache) {
			this.pathCache.set(cacheKey, results);
		}

		return results;
	}
}

export class JsonlPersistentExpressionStore
	extends BaseJsonlStore
	implements PersistentExpressionStore
{
	private expressions: CustomExpression[] = [];

	async init(): Promise<void> {
		if (this.initialized) return;
		try {
			if (await fileOrDirExists(this.filePath)) {
				const raw = await fs.readFile(this.filePath, "utf-8");
				const lines = raw.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const entry = JSON.parse(line);
					if (entry.type === "expression") {
						this.expressions.push(entry.data);
					}
				}
			}
		} catch (_) {}
		this.initialized = true;
	}

	async serializeAll(): Promise<void> {
		const lines = this.expressions.map((e) =>
			JSON.stringify({ type: "expression", data: e }),
		);
		await this.truncateAndWrite(lines);
	}

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
		await this.init();
		const context = {
			...expression.context,
			scope_level: scope.level,
			scope_id: scope.level === "user" ? scope.userId : null,
		};
		const saved = { ...expression, context };
		const idx = this.expressions.findIndex((e) => e.id === expression.id);
		if (idx !== -1) {
			this.expressions[idx] = saved;
		} else {
			this.expressions.push(saved);
		}
		await this.serializeAll();
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.init();
		const scopeId = scope.level === "user" ? scope.userId : null;
		const initialLength = this.expressions.length;
		this.expressions = this.expressions.filter((e) => {
			if (e.id !== id) return true;
			const el = e.context?.scope_level;
			const ei = e.context?.scope_id;
			return !(el === scope.level && (ei === scopeId || !ei));
		});
		if (this.expressions.length !== initialLength) {
			await this.serializeAll();
		}
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		await this.init();
		const scopeId = scope.level === "user" ? scope.userId : null;
		return this.expressions.filter((e) => {
			const el =
				e.context?.scope_level || (e.context?.user_id ? "user" : "global");
			const ei = e.context?.scope_id || e.context?.user_id;
			if (el === scope.level && (ei === scopeId || !ei)) return true;
			if (includeGlobal && el === "global") return true;
			return false;
		});
	}

	async getById(id: string): Promise<CustomExpression | null> {
		await this.init();
		return this.expressions.find((e) => e.id === id) || null;
	}
}
