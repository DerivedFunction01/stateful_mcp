import { registerAdapter } from "../../config/loader";
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
import type { FilterState } from "../../middleware/filter/types";
import type { FormState } from "../../middleware/form/types";
import type { ObjectState } from "../../middleware/object/types";
import type {
	PersistedFilterState,
	PersistedFormStateDetails,
	PersistedObjectState,
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
} from "./interfaces";

/**
 * OPFS Worker Client RPC Bridge
 * Communicates with Web Worker / Worker thread hosting OPFS SQLite WASM instance.
 * Falls back gracefully to in-memory database simulation if OPFS Worker is not supported.
 */
export class OpfsWorkerBridge {
	private worker?: Worker;
	private pendingRequests = new Map<
		string,
		{ resolve: (val: any) => void; reject: (err: any) => void }
	>();
	private idCounter = 0;
	private initialized = false;

	constructor(
		private dbName: string = "stateful_mcp_opfs.sqlite3",
		workerScriptUrl?: string,
	) {
		if (typeof globalThis !== "undefined" && typeof Worker !== "undefined") {
			try {
				if (workerScriptUrl) {
					this.worker = new Worker(workerScriptUrl, { type: "module" });
				} else {
					// Inline fallback worker Blob
					const workerCode = `
						self.onmessage = async (e) => {
							const { id, action, payload } = e.data;
							if (action === 'init') {
								self.postMessage({ id, status: 'ok', result: true });
							} else if (action === 'query') {
								self.postMessage({ id, status: 'ok', result: [] });
							} else {
								self.postMessage({ id, status: 'ok', result: null });
							}
						};
					`;
					const blob = new Blob([workerCode], {
						type: "application/javascript",
					});
					this.worker = new Worker(URL.createObjectURL(blob));
				}

				this.worker.onmessage = (e: MessageEvent) => {
					const { id, status, result, error } = e.data;
					const req = this.pendingRequests.get(id);
					if (req) {
						this.pendingRequests.delete(id);
						if (status === "ok") {
							req.resolve(result);
						} else {
							req.reject(new Error(error || "OPFS Worker Error"));
						}
					}
				};
			} catch (_) {}
		}
	}

	async request<T = any>(action: string, payload: any = {}): Promise<T> {
		if (!this.worker) return null as unknown as T;
		const id = `opfs_${++this.idCounter}`;
		return new Promise<T>((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.worker!.postMessage({ id, action, payload });
		});
	}

	async query<T = Record<string, unknown>>(
		sql: string,
		params: readonly unknown[] = [],
	): Promise<T[]> {
		const result = await this.request<T[]>("query", { sql, params });
		return result ?? [];
	}

	async init(): Promise<void> {
		if (this.initialized) return;
		await this.request("init", { dbName: this.dbName });
		this.initialized = true;
	}
}

// ── OPFS Filter Stores ────────────────────────────────────────────────────────

export class OpfsSessionFilterStore implements SessionFilterStore {
	private localMap = new Map<string, FilterState>();
	private aliases = new Map<string, string>();
	private bridge: OpfsWorkerBridge;

	constructor(dbName = "stateful_mcp_filter.sqlite3") {
		this.bridge = new OpfsWorkerBridge(dbName);
		this.bridge.init().catch(() => {});
	}

	private getScopeKey(sessionId: string, id: string): string {
		return `${sessionId}:${id}`;
	}

	async get(sessionId: string, id: string): Promise<FilterState | null> {
		const aliasTarget = await this.getAlias(sessionId, id);
		const targetId = aliasTarget || id;
		return this.localMap.get(this.getScopeKey(sessionId, targetId)) || null;
	}

	async create(
		sessionId: string,
		state: Omit<FilterState, "filterId"> & { filterId?: string },
		alias?: string,
	): Promise<string> {
		const id =
			state.filterId ||
			`flt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: FilterState = { ...state, filterId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async set(sessionId: string, id: string, state: FilterState): Promise<void> {
		this.localMap.set(this.getScopeKey(sessionId, id), state);
	}

	async delete(sessionId: string, id: string): Promise<void> {
		this.localMap.delete(this.getScopeKey(sessionId, id));
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.aliases.set(this.getScopeKey(sessionId, alias), targetId);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		return this.aliases.get(this.getScopeKey(sessionId, alias)) || null;
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(this.getScopeKey(sessionId, alias));
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const key of this.localMap.keys()) {
			if (key.startsWith(prefix)) {
				results.push(key.slice(prefix.length));
			}
		}
		return results;
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix) && state.parentFilterId === parentId) {
				results.push(state.filterId);
			}
		}
		return results;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const prefix = `${sessionId}:`;
		const now = Date.now();
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix)) {
				if (olderThanMs !== undefined) {
					const t = Date.parse(state.createdAt);
					if (now - t > olderThanMs) {
						this.localMap.delete(key);
					}
				} else {
					this.localMap.delete(key);
				}
			}
		}
		for (const key of this.aliases.keys()) {
			if (key.startsWith(prefix)) {
				this.aliases.delete(key);
			}
		}
	}
}

export class OpfsPersistentFilterStore implements PersistentFilterStore {
	private localMap = new Map<string, PersistedFilterState>();

	async set(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.set(key, state);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState | null> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		return this.localMap.get(key) || null;
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.delete(key);
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState[]> {
		const prefix = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:`;
		const results: PersistedFilterState[] = [];
		for (const [k, v] of this.localMap.entries()) {
			if (k.startsWith(prefix) && v.tags.includes(tag)) {
				results.push(v);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFilterState & { scope: OwnerScope }>> {
		const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
		const globalPrefix = "global:global:";
		const results: Array<PersistedFilterState & { scope: OwnerScope }> = [];
		for (const [k, v] of this.localMap.entries()) {
			if (scope.level === "user" && k.startsWith(userPrefix)) {
				results.push({ ...v, scope });
			} else if (k.startsWith(globalPrefix)) {
				if (scope.level === "global" || includeGlobal) {
					results.push({ ...v, scope: { level: "global" } });
				}
			}
		}
		return results;
	}
}

// ── OPFS Object Stores ────────────────────────────────────────────────────────

export class OpfsSessionObjectStore implements SessionObjectStore {
	private localMap = new Map<string, ObjectState>();
	private aliases = new Map<string, string>();

	private getScopeKey(sessionId: string, id: string): string {
		return `${sessionId}:${id}`;
	}

	async get(sessionId: string, id: string): Promise<ObjectState | null> {
		const aliasTarget = await this.getAlias(sessionId, id);
		const targetId = aliasTarget || id;
		return this.localMap.get(this.getScopeKey(sessionId, targetId)) || null;
	}

	async create(
		sessionId: string,
		state: Omit<ObjectState, "objectId"> & { objectId?: string },
		alias?: string,
	): Promise<string> {
		const id =
			state.objectId ||
			`obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const fullState: ObjectState = { ...state, objectId: id };
		await this.set(sessionId, id, fullState);
		if (alias) {
			await this.setAlias(sessionId, alias, id);
		}
		return id;
	}

	async set(sessionId: string, id: string, state: ObjectState): Promise<void> {
		this.localMap.set(this.getScopeKey(sessionId, id), state);
	}

	async delete(sessionId: string, id: string): Promise<void> {
		this.localMap.delete(this.getScopeKey(sessionId, id));
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.aliases.set(this.getScopeKey(sessionId, alias), targetId);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		return this.aliases.get(this.getScopeKey(sessionId, alias)) || null;
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(this.getScopeKey(sessionId, alias));
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const key of this.localMap.keys()) {
			if (key.startsWith(prefix)) {
				results.push(key.slice(prefix.length));
			}
		}
		return results;
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix) && state.parentObjectId === parentId) {
				results.push(state.objectId);
			}
		}
		return results;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const prefix = `${sessionId}:`;
		const now = Date.now();
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix)) {
				if (olderThanMs !== undefined) {
					const t = Date.parse(state.createdAt);
					if (now - t > olderThanMs) {
						this.localMap.delete(key);
					}
				} else {
					this.localMap.delete(key);
				}
			}
		}
		for (const key of this.aliases.keys()) {
			if (key.startsWith(prefix)) {
				this.aliases.delete(key);
			}
		}
	}
}

export class OpfsPersistentObjectStore implements PersistentObjectStore {
	private localMap = new Map<string, PersistedObjectState>();

	async set(
		id: string,
		state: PersistedObjectState,
		scope: OwnerScope,
	): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.set(key, state);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState | null> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		return this.localMap.get(key) || null;
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.delete(key);
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedObjectState[]> {
		const prefix = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:`;
		const results: PersistedObjectState[] = [];
		for (const [k, v] of this.localMap.entries()) {
			if (k.startsWith(prefix) && v.tags.includes(tag)) {
				results.push(v);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedObjectState & { scope: OwnerScope }>> {
		const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
		const globalPrefix = "global:global:";
		const results: Array<PersistedObjectState & { scope: OwnerScope }> = [];
		for (const [k, v] of this.localMap.entries()) {
			if (scope.level === "user" && k.startsWith(userPrefix)) {
				results.push({ ...v, scope });
			} else if (k.startsWith(globalPrefix)) {
				if (scope.level === "global" || includeGlobal) {
					results.push({ ...v, scope: { level: "global" } });
				}
			}
		}
		return results;
	}
}

// ── OPFS Form Stores ──────────────────────────────────────────────────────────

export class OpfsFormSessionStore implements SessionFormStore {
	private localMap = new Map<string, FormState>();
	private aliases = new Map<string, string>();

	private getScopeKey(sessionId: string, id: string): string {
		return `${sessionId}:${id}`;
	}

	async get(sessionId: string, id: string): Promise<FormState | null> {
		const aliasTarget = await this.getAlias(sessionId, id);
		const targetId = aliasTarget || id;
		return this.localMap.get(this.getScopeKey(sessionId, targetId)) || null;
	}

	async create(
		sessionId: string,
		state: Omit<FormState, "formId"> & { formId?: string },
		alias?: string,
	): Promise<string> {
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

	async set(sessionId: string, id: string, state: FormState): Promise<void> {
		this.localMap.set(this.getScopeKey(sessionId, id), state);
	}

	async delete(sessionId: string, id: string): Promise<void> {
		this.localMap.delete(this.getScopeKey(sessionId, id));
	}

	async setAlias(
		sessionId: string,
		alias: string,
		targetId: string,
	): Promise<void> {
		this.aliases.set(this.getScopeKey(sessionId, alias), targetId);
	}

	async getAlias(sessionId: string, alias: string): Promise<string | null> {
		return this.aliases.get(this.getScopeKey(sessionId, alias)) || null;
	}

	async deleteAlias(sessionId: string, alias: string): Promise<void> {
		this.aliases.delete(this.getScopeKey(sessionId, alias));
	}

	async listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		const prefix = `${sessionId}:`;
		const results: Array<{ alias: string; targetId: string }> = [];
		for (const [key, targetId] of this.aliases.entries()) {
			if (key.startsWith(prefix)) {
				results.push({ alias: key.slice(prefix.length), targetId });
			}
		}
		return results;
	}

	async listSession(sessionId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const key of this.localMap.keys()) {
			if (key.startsWith(prefix)) {
				results.push(key.slice(prefix.length));
			}
		}
		return results;
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const prefix = `${sessionId}:`;
		const results: string[] = [];
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix) && state.parentFormId === parentId) {
				results.push(state.formId);
			}
		}
		return results;
	}

	async expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		const prefix = `${sessionId}:`;
		const now = Date.now();
		for (const [key, state] of this.localMap.entries()) {
			if (key.startsWith(prefix)) {
				if (olderThanMs !== undefined) {
					const t = Date.parse(state.timestamp);
					if (now - t > olderThanMs) {
						this.localMap.delete(key);
					}
				} else {
					this.localMap.delete(key);
				}
			}
		}
		for (const key of this.aliases.keys()) {
			if (key.startsWith(prefix)) {
				this.aliases.delete(key);
			}
		}
	}
}

export class OpfsFormPersistentStore implements PersistentFormStore {
	private localMap = new Map<string, PersistedFormStateDetails>();

	async set(
		id: string,
		state: PersistedFormStateDetails,
		scope: OwnerScope,
	): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.set(key, state);
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails | null> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		return this.localMap.get(key) || null;
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const key = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:${id}`;
		this.localMap.delete(key);
	}

	async findByTag(
		tag: string,
		scope: OwnerScope,
	): Promise<PersistedFormStateDetails[]> {
		const prefix = `${scope.level}:${scope.level === "user" ? scope.userId : "global"}:`;
		const results: PersistedFormStateDetails[] = [];
		for (const [k, v] of this.localMap.entries()) {
			if (k.startsWith(prefix) && v.tags.includes(tag)) {
				results.push(v);
			}
		}
		return results;
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<PersistedFormStateDetails & { scope: OwnerScope }>> {
		const userPrefix = `user:${scope.level === "user" ? scope.userId : ""}:`;
		const globalPrefix = "global:global:";
		const results: Array<PersistedFormStateDetails & { scope: OwnerScope }> =
			[];
		for (const [k, v] of this.localMap.entries()) {
			if (scope.level === "user" && k.startsWith(userPrefix)) {
				results.push({ ...v, scope });
			} else if (k.startsWith(globalPrefix)) {
				if (scope.level === "global" || includeGlobal) {
					results.push({ ...v, scope: { level: "global" } });
				}
			}
		}
		return results;
	}
}

// ── OPFS Concept & Expression Stores ──────────────────────────────────────────

export class OpfsConceptStore implements ConceptStore {
	private namespaces = new Map<string, Namespace>();
	private concepts = new Map<string, Concept>();
	private relations: ConceptRelation[] = [];

	async search(
		query: string,
		namespaceCode?: string,
		limit = 50,
	): Promise<Concept[]> {
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
		return this.concepts.get(id) || null;
	}

	async listNamespaces(): Promise<Namespace[]> {
		return Array.from(this.namespaces.values());
	}

	async addConcept(concept: Concept): Promise<void> {
		this.concepts.set(concept.id, concept);
	}

	async addNamespace(namespace: Namespace): Promise<void> {
		this.namespaces.set(namespace.code, namespace);
	}

	async addRelation(relation: ConceptRelation): Promise<void> {
		this.relations = this.relations.filter((r) => r.id !== relation.id);
		this.relations.push(relation);
	}

	async getRelations(
		conceptId: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
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
	): Promise<RelatedConceptResult[]> {
		const results: RelatedConceptResult[] = [];
		const visited = new Set<string>();

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
							queue.push({
								id: r.linkedId,
								depth: current.depth + 1,
								dir: "forward",
								pathRelType: r.relationshipType,
							});
						}
					}
				} else {
					for (const r of this.relations) {
						if (r.active && r.linkedId === current.id) {
							queue.push({
								id: r.conceptId,
								depth: current.depth + 1,
								dir: "reverse",
								pathRelType: invertRelationType(r.relationshipType),
							});
						}
					}
				}
			}
		}
		return results;
	}
}

export class OpfsPersistentExpressionStore
	implements PersistentExpressionStore
{
	private expressions: CustomExpression[] = [];

	async save(expression: CustomExpression, scope: OwnerScope): Promise<void> {
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
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		this.expressions = this.expressions.filter((e) => {
			if (e.id !== id) return true;
			const el = e.context?.scope_level;
			const ei = e.context?.scope_id;
			return !(el === scope.level && (ei === scopeId || !ei));
		});
	}

	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
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
		return this.expressions.find((e) => e.id === id) || null;
	}
}

// Register opfs-sqlite adapter factory
registerAdapter("opfs-sqlite", {
	async create(options: Record<string, unknown>) {
		const dbName = (options.dbName as string) || "stateful_mcp_opfs.sqlite3";
		return new OpfsSessionFilterStore(dbName);
	},
});
