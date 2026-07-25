import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../../middleware/dictionary/interfaces";
import type {
	Concept,
	ConceptRelation,
	ConceptRelationCacheEntry,
	ConceptRelationType,
	CustomExpression,
	Namespace,
	RelatedConceptResult,
	TraversalDirection,
} from "../../../middleware/dictionary/types";
import { invertRelationType } from "../../../middleware/dictionary/types";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "./dict-backend";

export class SimpleConceptStore implements ConceptStore {
	constructor(private backend: ConceptStoreBackend) {}

	async load(): Promise<void> {
		await this.backend.load(this.concepts, this.namespaces, this.relations);
		this.rebuildIndexes();
	}

	async save(): Promise<void> {
		await this.backend.save(this.concepts, this.namespaces, this.relations);
	}

	private rebuildIndexes(): void {
		this.forwardRelations.clear();
		this.reverseRelations.clear();
		for (const r of this.relations) {
			if (!this.forwardRelations.has(r.conceptId)) {
				this.forwardRelations.set(r.conceptId, []);
			}
			this.forwardRelations.get(r.conceptId)!.push(r);

			if (!this.reverseRelations.has(r.linkedId)) {
				this.reverseRelations.set(r.linkedId, []);
			}
			this.reverseRelations.get(r.linkedId)!.push(r);
		}
	}

	protected namespaces = new Map<string, Namespace>();
	protected concepts = new Map<string, Concept>();
	protected relations: ConceptRelation[] = [];
	protected forwardRelations = new Map<string, ConceptRelation[]>();
	protected reverseRelations = new Map<string, ConceptRelation[]>();
	protected pathCache = new Map<string, ConceptRelationCacheEntry[]>();

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
		this.relations = this.relations.filter((r) => r.id !== relation.id);
		this.relations.push(relation);

		this.rebuildIndexes();
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

export class SimplePersistentExpressionStore
	implements PersistentExpressionStore
{
	constructor(private backend: ExpressionStoreBackend) {}

	async load(): Promise<void> {
		await this.backend.load(this.expressions);
	}

	async flush(): Promise<void> {
		await this.backend.save(this.expressions);
	}

	protected expressions: CustomExpression[] = [];

	async save(
		expression: CustomExpression,
		scope: { level: string; userId?: string | null },
	): Promise<void> {
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

	async delete(
		id: string,
		scope: { level: string; userId?: string | null },
	): Promise<void> {
		const scopeId = scope.level === "user" ? scope.userId : null;
		this.expressions = this.expressions.filter((e) => {
			if (e.id !== id) return true;
			const el = e.context?.scope_level;
			const ei = e.context?.scope_id;
			return !(el === scope.level && (ei === scopeId || !ei));
		});
	}

	async list(
		scope: { level: string; userId?: string | null },
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
