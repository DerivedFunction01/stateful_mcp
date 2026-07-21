import type { OwnerScope } from "../../config/types";
import type { ConceptStore, PersistentExpressionStore } from "./interfaces";
import type {
	Concept,
	CustomExpression,
	Namespace,
	ResolutionMetric,
} from "./types";

class WrappedMapConceptStore implements ConceptStore {
	constructor(private concepts: Map<string, Concept>) {}
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
		return [];
	}
	async addConcept(concept: Concept): Promise<void> {
		this.concepts.set(concept.id, concept);
	}
	async addNamespace(): Promise<void> {}
}

class WrappedArrayExpressionStore implements PersistentExpressionStore {
	constructor(private expressions: CustomExpression[]) {}
	async save(expression: CustomExpression): Promise<void> {
		this.expressions.push(expression);
	}
	async delete(id: string): Promise<void> {
		const idx = this.expressions.findIndex((e) => e.id === id);
		if (idx !== -1) this.expressions.splice(idx, 1);
	}
	async list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<CustomExpression[]> {
		const userId = scope.level === "user" ? scope.userId : null;
		return this.expressions.filter((e) => {
			const el =
				e.context?.scope_level || (e.context?.user_id ? "user" : "global");
			const ei = e.context?.scope_id || e.context?.user_id;
			if (el === scope.level && (ei === userId || !ei)) return true;
			if (includeGlobal && el === "global") return true;
			return false;
		});
	}
	async getById(id: string): Promise<CustomExpression | null> {
		return this.expressions.find((e) => e.id === id) || null;
	}
}

export type ResolutionStatus = "FOUND" | "PARTIAL" | "NOT_FOUND";

export interface AggregatedResult {
	conceptId: string;
	concept: Concept;
	score: number;
	matchedTerms: string[];
	sources: string[];
}

export interface ResolveResponse {
	status: ResolutionStatus;
	sources: string[];
	results: AggregatedResult[];
}

export interface ResolveResult {
	conceptId: string;
	concept: Concept;
	expression: CustomExpression;
	score: number;
}

export interface ConceptResolver {
	resolve(
		term: string,
		concepts: ConceptStore | Map<string, Concept>,
		expressions: PersistentExpressionStore | CustomExpression[],
		metrics: ResolutionMetric[],
		context?: Record<string, any>,
	): Promise<ResolveResponse>;
}

export class InMemoryConceptResolver implements ConceptResolver {
	private getExpressionScopeLevel(
		expr: CustomExpression,
	): "user" | "workspace" | "global" {
		if (expr.context?.user_id) return "user";
		if (expr.context?.workspace_id && expr.context.workspace_id !== "global")
			return "workspace";
		return "global";
	}

	private getExpressionScopeLevelNumeric(expr: CustomExpression): number {
		const level = this.getExpressionScopeLevel(expr);
		if (level === "user") return 3;
		if (level === "workspace") return 2;
		return 1;
	}

	private matchesContext(
		expr: CustomExpression,
		queryContext?: Record<string, any>,
	): boolean {
		const level = this.getExpressionScopeLevel(expr);
		const queryUserId = queryContext?.user_id;
		const queryWorkspaceId = queryContext?.workspace_id || "global";

		if (level === "user") {
			return !!queryUserId && expr.context?.user_id === queryUserId;
		}
		if (level === "workspace") {
			return expr.context?.workspace_id === queryWorkspaceId;
		}
		return true;
	}

	public async resolve(
		term: string,
		concepts: ConceptStore | Map<string, Concept>,
		expressions: PersistentExpressionStore | CustomExpression[],
		metrics: ResolutionMetric[],
		context?: Record<string, any>,
	): Promise<ResolveResponse> {
		const conceptStore =
			concepts instanceof Map ? new WrappedMapConceptStore(concepts) : concepts;
		const expressionStore = Array.isArray(expressions)
			? new WrappedArrayExpressionStore(expressions)
			: expressions;

		const candidates = new Map<
			string,
			{
				concept: Concept;
				score: number;
				matchedTerms: Set<string>;
				exact: boolean;
				maxTier: number;
			}
		>();

		const scope: OwnerScope = context?.user_id
			? { level: "user", userId: context.user_id }
			: { level: "global" };

		const exprs = await expressionStore.list(scope, true);

		for (const expr of exprs) {
			if (!expr.active || !expr.conceptId) continue;
			if (!this.matchesContext(expr, context)) continue;

			let matched = false;
			let isExact = false;

			if (expr.term.toLowerCase() === term.toLowerCase()) {
				matched = true;
				isExact = true;
			} else {
				try {
					const flags = expr.isCaseInsensitive ? "i" : "";
					const regex = new RegExp(expr.regexPattern, flags);
					if (regex.test(term)) {
						matched = true;
						isExact = true;
					}
				} catch (err) {
					if (term.toLowerCase().includes(expr.term.toLowerCase())) {
						matched = true;
					}
				}
			}

			if (matched) {
				const concept = await conceptStore.getById(expr.conceptId);
				if (concept && concept.active !== false) {
					let score = expr.priorityWeight;
					const metric = metrics.find(
						(m) =>
							m.expressionId === expr.id &&
							m.conceptId === expr.conceptId &&
							this.matchesContext(expr, context),
					);
					if (metric) {
						score += metric.usageCount * 10;
					}

					const tier = this.getExpressionScopeLevelNumeric(expr);
					const existing = candidates.get(expr.conceptId);
					if (existing) {
						existing.score += score;
						existing.matchedTerms.add(expr.term);
						if (isExact) existing.exact = true;
						if (tier > existing.maxTier) existing.maxTier = tier;
					} else {
						candidates.set(expr.conceptId, {
							concept,
							score,
							matchedTerms: new Set([expr.term]),
							exact: isExact,
							maxTier: tier,
						});
					}
				}
			}
		}

		if (candidates.size === 0) {
			return { status: "NOT_FOUND", sources: [], results: [] };
		}

		const sorted = Array.from(candidates.entries())
			.map(([conceptId, data]) => ({
				conceptId,
				concept: data.concept,
				score: data.score,
				matchedTerms: Array.from(data.matchedTerms),
				sources: ["local"],
				exact: data.exact,
				maxTier: data.maxTier,
			}))
			.sort((a, b) => {
				if (b.maxTier !== a.maxTier) {
					return b.maxTier - a.maxTier;
				}
				return b.score - a.score;
			});

		const top = sorted[0]!;
		const status: ResolutionStatus = top.exact ? "FOUND" : "PARTIAL";

		return {
			status,
			sources: ["local"],
			results: sorted.map(
				({ conceptId, concept, score, matchedTerms, sources }) => ({
					conceptId,
					concept,
					score,
					matchedTerms,
					sources,
				}),
			),
		};
	}
}

import type { BackendWeightConfig } from "./types";

export interface BackendInstance {
	config: BackendWeightConfig;
	currentWeight: number;
	resolver: ConceptResolver;
	concepts: Map<string, Concept>;
	expressions: CustomExpression[];
	metrics: ResolutionMetric[];
}

export class MultiBackendConceptResolver implements ConceptResolver {
	constructor(private backends: BackendInstance[]) {}

	public getBackends(): BackendInstance[] {
		return this.backends;
	}

	public adjustWeight(backendId: string, adjustment: number) {
		const backend = this.backends.find((b) => b.config.id === backendId);
		if (backend) {
			let newWeight = backend.currentWeight + adjustment;
			if (backend.config.minWeight !== undefined) {
				newWeight = Math.max(backend.config.minWeight, newWeight);
			}
			if (backend.config.maxWeight !== undefined) {
				newWeight = Math.min(backend.config.maxWeight, newWeight);
			}
			backend.currentWeight = Number(newWeight.toFixed(4));
		}
	}

	public async resolve(
		term: string,
		concepts: Map<string, Concept>,
		expressions: CustomExpression[],
		metrics: ResolutionMetric[],
		context?: Record<string, any>,
	): Promise<ResolveResponse> {
		const queryPromises = this.backends.map(async (b) => {
			try {
				const res = await b.resolver.resolve(
					term,
					b.concepts,
					b.expressions,
					b.metrics,
					context,
				);
				return {
					backendId: b.config.id,
					weight: b.currentWeight,
					response: res,
				};
			} catch (err) {
				return null;
			}
		});

		const responses = (await Promise.all(queryPromises)).filter(
			(r): r is NonNullable<typeof r> =>
				r !== null && r.response.status !== "NOT_FOUND",
		);

		if (responses.length === 0) {
			return { status: "NOT_FOUND", sources: [], results: [] };
		}

		const aggregated = new Map<
			string,
			{
				concept: Concept;
				score: number;
				matchedTerms: Set<string>;
				sources: Set<string>;
			}
		>();

		for (const resp of responses) {
			for (const res of resp.response.results) {
				const weightedScore = res.score * resp.weight;
				const existing = aggregated.get(res.conceptId);
				if (existing) {
					existing.score += weightedScore;
					res.matchedTerms.forEach((t) => existing.matchedTerms.add(t));
					existing.sources.add(resp.backendId);
				} else {
					aggregated.set(res.conceptId, {
						concept: res.concept,
						score: weightedScore,
						matchedTerms: new Set(res.matchedTerms),
						sources: new Set([resp.backendId]),
					});
				}
			}
		}

		const sorted = Array.from(aggregated.entries())
			.map(([conceptId, data]) => ({
				conceptId,
				concept: data.concept,
				score: Number(data.score.toFixed(4)),
				matchedTerms: Array.from(data.matchedTerms),
				sources: Array.from(data.sources),
			}))
			.sort((a, b) => b.score - a.score);

		const topConceptId = sorted[0]!.conceptId;

		const hasExactWinner = responses.some(
			(resp) =>
				resp.response.status === "FOUND" &&
				resp.response.results[0]?.conceptId === topConceptId,
		);

		const status: ResolutionStatus = hasExactWinner ? "FOUND" : "PARTIAL";

		let winningBackendId: string | null = null;
		if (status === "FOUND") {
			const winnerResponse = responses.find(
				(resp) =>
					resp.response.status === "FOUND" &&
					resp.response.results[0]?.conceptId === topConceptId,
			);
			if (winnerResponse) {
				winningBackendId = winnerResponse.backendId;
			}
		}

		const responsePayload: ResolveResponse & {
			_winningBackendId?: string | null;
		} = {
			status,
			sources: Array.from(new Set(responses.map((r) => r.backendId))),
			results: sorted,
		};

		if (winningBackendId) {
			responsePayload._winningBackendId = winningBackendId;
		}

		return responsePayload;
	}
}
