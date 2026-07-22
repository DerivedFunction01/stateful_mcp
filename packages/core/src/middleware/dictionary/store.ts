import * as crypto from "crypto";
import type { OwnerScope } from "../../config/types";
import { ErrorCode, StatefulFrameworkError } from "../../errors/types";
import type { ConceptStore, PersistentExpressionStore } from "./interfaces";
import type { ConceptResolver } from "./resolver";
import type {
	Concept,
	ConceptRelation,
	ConceptRelationCacheEntry,
	ConceptRelationType,
	CustomExpression,
	DictionaryConfig,
	Namespace,
	RelatedConceptResult,
	ResolutionMetric,
	TraversalDirection,
	WorkspaceDefinition,
} from "./types";
import { invertRelationType } from "./types";

export class InMemoryConceptStore implements ConceptStore {
	private namespaces = new Map<string, Namespace>();
	private concepts = new Map<string, Concept>();
	private forwardRelations = new Map<string, ConceptRelation[]>();
	private reverseRelations = new Map<string, ConceptRelation[]>();
	private pathCache = new Map<string, ConceptRelationCacheEntry[]>();

	async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
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
		if (!this.forwardRelations.has(relation.conceptId)) {
			this.forwardRelations.set(relation.conceptId, []);
		}
		this.forwardRelations.get(relation.conceptId)!.push(relation);

		if (!this.reverseRelations.has(relation.linkedId)) {
			this.reverseRelations.set(relation.linkedId, []);
		}
		this.reverseRelations.get(relation.linkedId)!.push(relation);

		await this.invalidateRelationCache(relation.conceptId);
		await this.invalidateRelationCache(relation.linkedId);
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
		const results: ConceptRelation[] = [];
		if (direction === "forward" || direction === "both") {
			const fw = this.forwardRelations.get(conceptId) || [];
			results.push(...fw.filter((r) => r.active));
		}
		if (direction === "reverse" || direction === "both") {
			const rev = this.reverseRelations.get(conceptId) || [];
			results.push(...rev.filter((r) => r.active));
		}
		return results;
	}

	async getRelatedConcepts(
		conceptId: string,
		direction: TraversalDirection = "both",
		maxDepth = 3,
		useCache = true,
	): Promise<RelatedConceptResult[]> {
		const results: RelatedConceptResult[] = [];
		const visited = new Set<string>();

		// 1. Check transitive cache if enabled and searching both or forward
		const cacheKey = `${conceptId}:${direction}:${maxDepth}`;
		if (useCache && this.pathCache.has(cacheKey)) {
			const cachedEntries = this.pathCache.get(cacheKey)!;
			for (const entry of cachedEntries) {
				const concept = await this.getById(entry.descendantConceptId);
				if (concept && concept.active !== false) {
					results.push({
						concept,
						relationshipType: entry.inferredRelationshipType,
						direction: "forward",
						depth: entry.linkDepth,
					});
				}
			}
			return results;
		}

		// 2. Perform graph BFS/DFS with operator duality inversion
		const queue: Array<{
			id: string;
			depth: number;
			dir: "forward" | "reverse";
			pathRelType: ConceptRelationType;
		}> = [];

		if (direction === "forward" || direction === "both") {
			const fw = this.forwardRelations.get(conceptId) || [];
			for (const r of fw) {
				if (r.active)
					queue.push({
						id: r.linkedId,
						depth: 1,
						dir: "forward",
						pathRelType: r.relationshipType,
					});
			}
		}

		if (direction === "reverse" || direction === "both") {
			const rev = this.reverseRelations.get(conceptId) || [];
			for (const r of rev) {
				if (r.active) {
					queue.push({
						id: r.conceptId,
						depth: 1,
						dir: "reverse",
						pathRelType: invertRelationType(r.relationshipType),
					});
				}
			}
		}

		const cacheEntries: ConceptRelationCacheEntry[] = [];

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

				cacheEntries.push({
					ancestorConceptId: conceptId,
					descendantConceptId: current.id,
					linkDepth: current.depth,
					inferredRelationshipType: current.pathRelType,
					active: true,
					updatedAt: new Date().toISOString(),
				});
			}

			// Traverse next hop
			if (current.depth < maxDepth) {
				if (current.dir === "forward") {
					const nextFw = this.forwardRelations.get(current.id) || [];
					for (const r of nextFw) {
						if (r.active) {
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
					const nextRev = this.reverseRelations.get(current.id) || [];
					for (const r of nextRev) {
						if (r.active) {
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
			this.pathCache.set(cacheKey, cacheEntries);
		}

		return results;
	}
}

export class InMemoryPersistentExpressionStore
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

// REFERENCE: docs/dictionary.md
export class DictionaryStore {
	private relations: ConceptRelation[] = [];
	private metrics: ResolutionMetric[] = [];
	private allowedTargetAssignments?: string[];
	private workspaces: WorkspaceDefinition[] = [];
	private allowedTags?: string[];
	private exposeTagsAsEnum = false;
	private defaultDynamicNamespace = "CUSTOM";
	private defaultWorkspaceId = "global";
	private exposeWorkspaceAsEnum = false;

	constructor(
		private resolver: ConceptResolver,
		private conceptStore: ConceptStore = new InMemoryConceptStore(),
		private expressionStore: PersistentExpressionStore = new InMemoryPersistentExpressionStore(),
	) {}

	public async search(
		query: string,
		namespaceCode?: string,
		limit: number = 50,
	): Promise<Concept[]> {
		return this.conceptStore.search(query, namespaceCode, limit);
	}

	public async loadConfig(config: DictionaryConfig): Promise<void> {
		if (config.allowedTargetAssignments) {
			this.allowedTargetAssignments = config.allowedTargetAssignments;
		}
		if (config.workspaces) {
			this.workspaces = config.workspaces;
		}
		if (config.allowedTags) {
			this.allowedTags = config.allowedTags;
		}
		if (config.exposeTagsAsEnum !== undefined) {
			this.exposeTagsAsEnum = config.exposeTagsAsEnum;
		}
		if (config.exposeWorkspaceAsEnum !== undefined) {
			this.exposeWorkspaceAsEnum = config.exposeWorkspaceAsEnum;
		}
		this.defaultWorkspaceId =
			config.defaultWorkspaceId || process.env.WORKSPACE_ID || "global";
		if (config.defaultDynamicNamespace) {
			this.defaultDynamicNamespace = config.defaultDynamicNamespace;
		}
		if (config.namespaces) {
			for (const ns of config.namespaces) {
				await this.conceptStore.addNamespace(ns);
			}
		}
		if (config.concepts) {
			for (const c of config.concepts) {
				await this.conceptStore.addConcept(c);
			}
		}
		if (config.relations) {
			this.relations = [...this.relations, ...config.relations];
			if (typeof this.conceptStore.addRelation === "function") {
				for (const rel of config.relations) {
					await this.conceptStore.addRelation(rel);
				}
			}
		}
		if (config.expressions) {
			for (const expr of config.expressions) {
				await this.addExpression(expr);
			}
		}
	}

	public async getRelatedConcepts(
		conceptId: string,
		direction: TraversalDirection = "both",
		maxDepth = 3,
		useCache = true,
	): Promise<RelatedConceptResult[]> {
		if (typeof this.conceptStore.getRelatedConcepts === "function") {
			return this.conceptStore.getRelatedConcepts(
				conceptId,
				direction,
				maxDepth,
				useCache,
			);
		}
		return [];
	}

	public shouldExposeWorkspaceAsEnum(): boolean {
		return this.exposeWorkspaceAsEnum;
	}

	public getDefaultWorkspace(): string {
		return this.defaultWorkspaceId;
	}

	public getWorkspaces(): WorkspaceDefinition[] {
		return this.workspaces;
	}

	public async resolveConceptId(ref: string): Promise<string | undefined> {
		if (ref.includes("::")) {
			const idx = ref.indexOf("::");
			const ns = ref.slice(0, idx);
			const code = ref.slice(idx + 2);
			const matches = await this.conceptStore.search(code, ns);
			const exact = matches.find(
				(c) => c.namespaceCode === ns && c.standardCode === code,
			);
			return exact?.id;
		}
		const match = await this.conceptStore.getById(ref);
		return match ? match.id : undefined;
	}

	public getAllowedTags(): string[] {
		return this.allowedTags || [];
	}

	public shouldExposeTagsAsEnum(): boolean {
		return this.exposeTagsAsEnum;
	}

	public getDefaultDynamicNamespace(): string {
		return this.defaultDynamicNamespace;
	}

	public async addNamespace(ns: Namespace): Promise<void> {
		await this.conceptStore.addNamespace(ns);
	}

	public async getNamespace(code: string): Promise<Namespace | undefined> {
		const nss = await this.conceptStore.listNamespaces();
		return nss.find((n) => n.code === code);
	}

	private async verifyNamespaceMutable(namespaceCode: string): Promise<void> {
		const ns = await this.getNamespace(namespaceCode);
		if (ns && ns.isMutable === false) {
			throw new StatefulFrameworkError(
				ErrorCode.DICTIONARY_MUTATION_DENIED,
				`Namespace "${namespaceCode}" is read-only.`,
			);
		}
	}

	private checkScopeAccess(
		exprContext: Record<string, any> | undefined,
		callerContext?: Record<string, any>,
	) {
		if (!callerContext) return;

		const exprWorkspace = exprContext?.workspace_id || "global";
		const exprUserId = exprContext?.user_id;

		if (exprUserId) {
			if (callerContext.user_id !== exprUserId) {
				throw new StatefulFrameworkError(
					ErrorCode.DICTIONARY_MUTATION_DENIED,
					"Access denied: Cannot modify another user's personal expression.",
				);
			}
		} else if (exprWorkspace === "global") {
			if (!callerContext.is_admin) {
				throw new StatefulFrameworkError(
					ErrorCode.DICTIONARY_MUTATION_DENIED,
					"Access denied: Insufficient privilege for global scope expressions.",
				);
			}
		} else {
			if (callerContext.workspace_id !== exprWorkspace) {
				throw new StatefulFrameworkError(
					ErrorCode.DICTIONARY_MUTATION_DENIED,
					`Access denied: Caller workspace "${callerContext.workspace_id}" does not match expression workspace "${exprWorkspace}".`,
				);
			}
		}
	}

	public async addConcept(
		c: Omit<Concept, "id"> & { id?: string },
	): Promise<string> {
		await this.verifyNamespaceMutable(c.namespaceCode);
		const conceptId =
			c.id ||
			`concept_dyn_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		if (!conceptId) {
			throw new StatefulFrameworkError(
				ErrorCode.CONCEPT_ALLOCATION_FAILED,
				"Failed to allocate a valid unique Concept ID.",
			);
		}
		const newConcept: Concept = {
			...c,
			id: conceptId,
			active: c.active !== false,
		};
		await this.conceptStore.addConcept(newConcept);
		return conceptId;
	}

	public async editConcept(
		id: string,
		updates: Partial<Concept>,
		callerContext?: Record<string, any>,
	): Promise<void> {
		const concept = await this.conceptStore.getById(id);
		if (!concept) {
			throw new StatefulFrameworkError(
				ErrorCode.CONCEPT_NOT_FOUND,
				`Concept "${id}" not found.`,
			);
		}
		await this.verifyNamespaceMutable(concept.namespaceCode);

		if (
			updates.standardCode !== undefined &&
			updates.standardCode !== concept.standardCode
		) {
			throw new StatefulFrameworkError(
				ErrorCode.DICTIONARY_MUTATION_DENIED,
				"Cannot edit a concept's standardCode coordinate identity.",
			);
		}
		if (
			updates.namespaceCode !== undefined &&
			updates.namespaceCode !== concept.namespaceCode
		) {
			throw new StatefulFrameworkError(
				ErrorCode.DICTIONARY_MUTATION_DENIED,
				"Cannot edit a concept's namespaceCode coordinate identity.",
			);
		}

		const updated = { ...concept, ...updates };
		await this.conceptStore.addConcept(updated);
	}

	public async removeConcept(
		id: string,
		callerContext?: Record<string, any>,
	): Promise<void> {
		const concept = await this.conceptStore.getById(id);
		if (!concept) {
			throw new StatefulFrameworkError(
				ErrorCode.CONCEPT_NOT_FOUND,
				`Concept "${id}" not found.`,
			);
		}
		await this.verifyNamespaceMutable(concept.namespaceCode);

		const scope: OwnerScope = { level: "global" };
		const exprs = await this.expressionStore.list(scope, true);
		const activeExprs = exprs.filter((e) => e.conceptId === id && e.active);
		if (activeExprs.length > 0) {
			throw new StatefulFrameworkError(
				ErrorCode.DICTIONARY_MUTATION_DENIED,
				`Cannot remove concept "${id}": it is referenced by active expressions.`,
			);
		}

		const activeRels = this.relations.filter(
			(r) => (r.conceptId === id || r.linkedId === id) && r.active,
		);
		if (activeRels.length > 0) {
			throw new StatefulFrameworkError(
				ErrorCode.DICTIONARY_MUTATION_DENIED,
				`Cannot remove concept "${id}": it is referenced by active relations.`,
			);
		}

		concept.active = false;
		await this.conceptStore.addConcept(concept);
		console.error(JSON.stringify({ event: "CONCEPT_DEACTIVATED", id }));
	}

	public async getConcept(id: string): Promise<Concept | undefined> {
		return (await this.conceptStore.getById(id)) || undefined;
	}

	public async addRelation(rel: ConceptRelation): Promise<void> {
		const source = await this.getConcept(rel.conceptId);
		const target = await this.getConcept(rel.linkedId);
		if (source) await this.verifyNamespaceMutable(source.namespaceCode);
		if (target) await this.verifyNamespaceMutable(target.namespaceCode);

		this.relations.push(rel);
		if (typeof this.conceptStore.addRelation === "function") {
			await this.conceptStore.addRelation(rel);
		}
	}

	public async removeRelation(
		id: string,
		callerContext?: Record<string, any>,
	): Promise<void> {
		const relation = this.relations.find((r) => r.id === id);
		if (!relation) {
			throw new StatefulFrameworkError(
				ErrorCode.CONCEPT_NOT_FOUND,
				`Relation "${id}" not found.`,
			);
		}
		const source = await this.getConcept(relation.conceptId);
		const target = await this.getConcept(relation.linkedId);
		if (source) await this.verifyNamespaceMutable(source.namespaceCode);
		if (target) await this.verifyNamespaceMutable(target.namespaceCode);

		relation.active = false;
		if (typeof this.conceptStore.invalidateRelationCache === "function") {
			await this.conceptStore.invalidateRelationCache();
		}
		console.error(JSON.stringify({ event: "RELATION_DEACTIVATED", id }));
	}

	public async getRelations(
		conceptId?: string,
		direction: TraversalDirection = "both",
	): Promise<ConceptRelation[]> {
		if (conceptId && typeof this.conceptStore.getRelations === "function") {
			return this.conceptStore.getRelations(conceptId, direction);
		}
		if (conceptId) {
			return this.relations.filter((r) => {
				if (!r.active) return false;
				if (direction === "forward") return r.conceptId === conceptId;
				if (direction === "reverse") return r.linkedId === conceptId;
				return r.conceptId === conceptId || r.linkedId === conceptId;
			});
		}
		return this.relations;
	}

	public async addExpression(
		expr: Omit<CustomExpression, "id"> & { id?: string },
		callerContext?: Record<string, any>,
	): Promise<string> {
		this.checkScopeAccess(expr.context, callerContext);

		if (
			this.allowedTargetAssignments &&
			this.allowedTargetAssignments.length > 0
		) {
			if (!this.allowedTargetAssignments.includes(expr.targetAssignment)) {
				throw new Error(
					`Target assignment "${expr.targetAssignment}" is not in the allowed list of assignments: [${this.allowedTargetAssignments.join(", ")}]`,
				);
			}
		}
		const workspaceId = expr.context?.workspace_id || "global";
		if (this.workspaces.length > 0 && workspaceId !== "global") {
			const exists = this.workspaces.some((w) => w.id === workspaceId);
			if (!exists) {
				throw new Error(
					`Workspace "${workspaceId}" is not in the configured workspaces list.`,
				);
			}
		}
		const tags = expr.context?.tags;
		if (
			this.allowedTags &&
			this.allowedTags.length > 0 &&
			Array.isArray(tags)
		) {
			for (const t of tags) {
				if (!this.allowedTags.includes(t)) {
					throw new Error(
						`Tag "${t}" is not in the configured allowed tags list: [${this.allowedTags.join(", ")}].`,
					);
				}
			}
		}
		const id =
			expr.id || `expr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const newExpr: CustomExpression = {
			...expr,
			id,
			active: expr.active ?? true,
			priorityWeight: expr.priorityWeight ?? 1,
		};

		const scope: OwnerScope = expr.context?.user_id
			? { level: "user", userId: expr.context.user_id }
			: { level: "global" };

		await this.expressionStore.save(newExpr, scope);
		return id;
	}

	public async editExpression(
		id: string,
		updates: Partial<CustomExpression>,
		callerContext?: Record<string, any>,
	): Promise<void> {
		const expr = await this.expressionStore.getById(id);
		if (!expr) {
			throw new StatefulFrameworkError(
				ErrorCode.EXPRESSION_INVALID,
				`Expression "${id}" not found.`,
			);
		}

		this.checkScopeAccess(expr.context, callerContext);
		if (updates.context) {
			this.checkScopeAccess(updates.context, callerContext);
		}

		if (updates.term !== undefined) expr.term = updates.term;
		if (updates.regexPattern !== undefined)
			expr.regexPattern = updates.regexPattern;
		if (updates.isCaseInsensitive !== undefined)
			expr.isCaseInsensitive = updates.isCaseInsensitive;
		if (updates.targetAssignment !== undefined) {
			if (
				this.allowedTargetAssignments &&
				this.allowedTargetAssignments.length > 0
			) {
				if (!this.allowedTargetAssignments.includes(updates.targetAssignment)) {
					throw new Error(
						`Target assignment "${updates.targetAssignment}" is not in the allowed list of assignments: [${this.allowedTargetAssignments.join(", ")}]`,
					);
				}
			}
			expr.targetAssignment = updates.targetAssignment;
		}
		if (updates.conceptId !== undefined) expr.conceptId = updates.conceptId;
		if (updates.priorityWeight !== undefined)
			expr.priorityWeight = updates.priorityWeight;
		if (updates.active !== undefined) expr.active = updates.active;
		if (updates.context !== undefined) expr.context = updates.context;

		const saveScope: OwnerScope = expr.context?.user_id
			? { level: "user", userId: expr.context.user_id }
			: { level: "global" };

		await this.expressionStore.save(expr, saveScope);
		console.error(JSON.stringify({ event: "EXPRESSION_MODIFIED", id }));
	}

	public async removeExpression(
		id: string,
		callerContext?: Record<string, any>,
	): Promise<boolean> {
		const expr = await this.expressionStore.getById(id);
		if (!expr) return false;

		this.checkScopeAccess(expr.context, callerContext);

		const hasMetrics = this.metrics.some(
			(m) => m.expressionId === id && m.usageCount > 0,
		);
		const scope: OwnerScope = expr.context?.user_id
			? { level: "user", userId: expr.context.user_id }
			: { level: "global" };

		if (hasMetrics) {
			expr.active = false;
			await this.expressionStore.save(expr, scope);
			console.error(JSON.stringify({ event: "EXPRESSION_DEACTIVATED", id }));
			return true;
		} else {
			await this.expressionStore.delete(id, scope);
			console.error(JSON.stringify({ event: "EXPRESSION_REMOVED", id }));
			return true;
		}
	}

	public async getExpressions(scope?: OwnerScope): Promise<CustomExpression[]> {
		const targetScope = scope || { level: "global" as const };
		return this.expressionStore.list(targetScope, true);
	}

	private getExpressionScopeLevel(
		exprContext?: Record<string, any>,
	): "user" | "workspace" | "global" {
		if (exprContext?.user_id) return "user";
		if (exprContext?.workspace_id && exprContext.workspace_id !== "global")
			return "workspace";
		return "global";
	}

	private matchesContext(
		exprContext?: Record<string, any>,
		queryContext?: Record<string, any>,
	): boolean {
		const level = this.getExpressionScopeLevel(exprContext);
		const queryUserId = queryContext?.user_id;
		const queryWorkspaceId = queryContext?.workspace_id || "global";

		if (level === "user") {
			return !!queryUserId && exprContext?.user_id === queryUserId;
		}
		if (level === "workspace") {
			return exprContext?.workspace_id === queryWorkspaceId;
		}
		return true;
	}

	public async resolve(
		term: string,
		context?: Record<string, any>,
	): Promise<any> {
		const result = await this.resolver.resolve(
			term,
			this.conceptStore,
			this.expressionStore,
			this.metrics,
			context,
		);

		if (result.status === "FOUND" && result.results.length > 0) {
			const top = result.results[0]!;
			const scope: OwnerScope = context?.user_id
				? { level: "user", userId: context.user_id }
				: { level: "global" };
			const exprs = await this.expressionStore.list(scope, true);
			const matchingExpr = exprs.find(
				(e) =>
					e.conceptId === top.conceptId && top.matchedTerms.includes(e.term),
			);
			if (matchingExpr) {
				this.recordUsage(matchingExpr.id, top.conceptId, context || {});
			}
		}

		const winningBackendId = (result as any)._winningBackendId;
		if (
			winningBackendId &&
			typeof (this.resolver as any).adjustWeight === "function"
		) {
			(this.resolver as any).adjustWeight(winningBackendId, 0.05);
			if (typeof (this.resolver as any).getBackends === "function") {
				const backends = (this.resolver as any).getBackends();
				for (const b of backends) {
					if (b.config.id !== winningBackendId) {
						(this.resolver as any).adjustWeight(b.config.id, -0.01);
					}
				}
			}
		}

		return result;
	}

	public async find(
		query: { term?: string; tags?: string[]; conceptType?: string },
		context?: Record<string, any>,
	): Promise<CustomExpression[]> {
		const scope: OwnerScope = context?.user_id
			? { level: "user", userId: context.user_id }
			: { level: "global" };

		const exprs = await this.expressionStore.list(scope, true);

		const filtered: CustomExpression[] = [];
		for (const expr of exprs) {
			if (!expr.active) continue;
			if (!this.matchesContext(expr.context, context)) continue;

			if (query.term) {
				const matchesTerm = expr.term
					.toLowerCase()
					.includes(query.term.toLowerCase());
				const matchesPattern = expr.regexPattern
					.toLowerCase()
					.includes(query.term.toLowerCase());
				if (!matchesTerm && !matchesPattern) continue;
			}

			if (query.tags && query.tags.length > 0) {
				const exprTags = expr.context?.tags;
				if (!Array.isArray(exprTags)) continue;
				const hasAllTags = query.tags.every((t) => exprTags.includes(t));
				if (!hasAllTags) continue;
			}

			if (query.conceptType) {
				const concept = expr.conceptId
					? await this.conceptStore.getById(expr.conceptId)
					: null;
				if (
					!concept ||
					concept.namespaceCode.toLowerCase() !==
						query.conceptType.toLowerCase()
				) {
					continue;
				}
			}

			filtered.push(expr);
		}
		return filtered;
	}

	public recordUsage(
		expressionId: string,
		conceptId: string,
		context: Record<string, any>,
	) {
		const existing = this.metrics.find(
			(m) =>
				m.expressionId === expressionId &&
				m.conceptId === conceptId &&
				JSON.stringify(m.context) === JSON.stringify(context),
		);

		if (existing) {
			existing.usageCount++;
			existing.lastResolvedAt = new Date().toISOString();
		} else {
			this.metrics.push({
				expressionId,
				conceptId,
				context,
				usageCount: 1,
				lastResolvedAt: new Date().toISOString(),
			});
		}
	}

	public getMetrics(): ResolutionMetric[] {
		return this.metrics;
	}
}
