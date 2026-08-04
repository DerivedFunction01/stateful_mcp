import type { OwnerScope } from "../../config/types";
import { isConceptAllowed } from "./filters";
import type {
	ConceptFilterStore,
	ConceptStore,
	DictionarySource,
	PersistentExpressionStore,
} from "./interfaces";
import type {
	Concept,
	CustomExpression,
	Namespace,
	ResolutionMetric,
} from "./types";
import { normalizeLookupTerm, tokenizeLookupQuery } from "./types";

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
	async getByIds(ids: string[]): Promise<Concept[]> {
		const wanted = new Set(ids);
		return [...this.concepts.values()].filter((concept) =>
			wanted.has(concept.id),
		);
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
	async searchCandidates(request: {
		query?: string;
		lookupTerm?: string;
		lookupPrefix?: string;
		activeOnly?: boolean;
		scope?: OwnerScope;
		limit?: number;
	}): Promise<CustomExpression[]> {
		const lookup = request.lookupTerm
			? normalizeLookupTerm(request.lookupTerm)
			: undefined;
		const query = request.query
			? normalizeLookupTerm(request.query)
			: undefined;
		const queryTokens = query ? tokenizeLookupQuery(query) : [];
		const prefix = request.lookupPrefix
			? normalizeLookupTerm(request.lookupPrefix)
			: undefined;
		return this.expressions
			.filter((expression) => {
				if (request.activeOnly && !expression.active) return false;
				if (request.scope) {
					const level =
						expression.context?.scope_level ??
						(expression.context?.user_id ? "user" : "global");
					const scopeId =
						expression.context?.scope_id ?? expression.context?.user_id;
					const requestedId =
						request.scope.level === "user" ? request.scope.userId : undefined;
					const scopeMatches =
						(level === request.scope.level &&
							(level !== "user" || scopeId === requestedId)) ||
						(request.scope.level !== "global" && level === "global");
					if (!scopeMatches) return false;
				}
				const expressionKey = normalizeLookupTerm(
					expression.lookupTerm ?? expression.term,
				);
				if (lookup && expressionKey !== lookup) return false;
				if (
					query &&
					!queryTokens.some(
						(token) =>
							query.includes(expressionKey) || expressionKey.includes(token),
					)
				)
					return false;
				if (prefix && !expressionKey.startsWith(prefix)) return false;
				return true;
			})
			.slice(0, request.limit ?? 50);
	}
}

export type ResolutionStatus = "FOUND" | "PARTIAL" | "NOT_FOUND";

export interface CustomExpressionMatch {
	matched: boolean;
	exact: boolean;
	namedGroups?: Record<string, string | undefined>;
}

/** Applies the authoritative Node-side expression match after candidate lookup. */
export function matchCustomExpression(
	expression: CustomExpression,
	term: string,
	strictRegex = false,
): CustomExpressionMatch {
	const normalizedTerm = normalizeLookupTerm(term);
	const normalizedLookup = normalizeLookupTerm(
		expression.lookupTerm ?? expression.term,
	);
	if (!strictRegex && normalizedLookup === normalizedTerm) {
		return { matched: true, exact: true };
	}
	if (expression.regexPattern.trim().length > 0) {
		try {
			const flags = expression.isCaseInsensitive ? "i" : "";
			const match = new RegExp(expression.regexPattern, flags).exec(term);
			return {
				matched: match !== null,
				exact: match !== null,
				namedGroups: match?.groups,
			};
		} catch {
			// Preserve legacy substring fallback only for malformed patterns.
		}
	}

	return {
		matched:
			normalizedLookup === normalizedTerm ||
			normalizedTerm.includes(normalizedLookup),
		exact: normalizedLookup === normalizedTerm,
	};
}

export interface AggregatedResult {
	conceptId: string;
	concept: Concept;
	score: number;
	matchedTerms: string[];
	sources: string[];
	freshness?: "fresh" | "stale" | "unknown";
	authority?: "authoritative" | "derived" | "user";
	partial?: boolean;
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

export interface InMemoryConceptResolverOptions {
	filterStore?: ConceptFilterStore;
	filterRole?: string;
	source?: DictionarySource;
	sourceId?: string;
	freshness?: "fresh" | "stale" | "unknown";
	authority?: "authoritative" | "derived" | "user";
	enableGlobalAggregation?: boolean;
	weightStore?: {
		getWeight(category: string, key: string, subKey?: string): Promise<number>;
	};
}

export class InMemoryConceptResolver implements ConceptResolver {
	constructor(private options: InMemoryConceptResolverOptions = {}) {}
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
		const filterRole =
			context?.roleName ?? context?.role_name ?? this.options.filterRole;
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
		const conceptIds = [
			...new Set(
				exprs.map((expr) => expr.conceptId).filter((id): id is string => !!id),
			),
		];
		const hydratedConcepts = conceptStore.getByIds
			? new Map(
					(await conceptStore.getByIds(conceptIds)).map((concept) => [
						concept.id,
						concept,
					]),
				)
			: null;

		for (const expr of exprs) {
			if (!expr.active || !expr.conceptId) continue;
			if (!this.matchesContext(expr, context)) continue;

			const expressionMatch = matchCustomExpression(expr, term);
			const matched = expressionMatch.matched;
			const isExact = expressionMatch.exact;

			if (matched) {
				const concept =
					hydratedConcepts?.get(expr.conceptId) ??
					(await conceptStore.getById(expr.conceptId));
				if (concept && concept.active !== false) {
					if (this.options.filterStore && filterRole) {
						const filters = await this.options.filterStore.listForConceptRole(
							concept.id,
							filterRole,
						);
						if (!isConceptAllowed(filters, filterRole)) continue;
					}
					let score = expr.priorityWeight;
					const metric = metrics.find(
						(m) =>
							m.expressionId === expr.id &&
							m.conceptId === expr.conceptId &&
							this.matchesContext(expr, context),
					);

					let finalCTR = 0.5;
					if (this.options.enableGlobalAggregation && context?.user_id) {
						const userMetric = metrics.find(
							(m) =>
								m.expressionId === expr.id &&
								m.conceptId === expr.conceptId &&
								m.context?.user_id === context.user_id,
						);
						const globalMetric = metrics.find(
							(m) =>
								m.expressionId === expr.id &&
								m.conceptId === expr.conceptId &&
								m.context?.level === "global",
						);

						const userCTR = userMetric
							? (userMetric.usageCount + 1) /
								((userMetric.impressionCount ?? userMetric.usageCount) + 2)
							: 0.5;
						const globalCTR = globalMetric
							? (globalMetric.usageCount + 1) /
								((globalMetric.impressionCount ?? globalMetric.usageCount) + 2)
							: 0.5;

						let userWeight = 0.7;
						let globalWeight = 0.3;
						if (this.options.weightStore) {
							try {
								userWeight = await this.options.weightStore.getWeight(
									"dictionary_ctr_blending",
									"user_weight",
								);
								globalWeight = await this.options.weightStore.getWeight(
									"dictionary_ctr_blending",
									"global_weight",
								);
							} catch (e) {
								// fallback to defaults
							}
						}
						const totalWeight = userWeight + globalWeight;
						const normUser = totalWeight > 0 ? userWeight / totalWeight : 0.7;
						const normGlobal =
							totalWeight > 0 ? globalWeight / totalWeight : 0.3;

						finalCTR = normUser * userCTR + normGlobal * globalCTR;
					} else {
						const usageCount = metric ? metric.usageCount : 0;
						const impressionCount = metric
							? (metric.impressionCount ?? metric.usageCount)
							: 0;
						finalCTR = (usageCount + 1) / (impressionCount + 2);
					}

					const usageCount = metric ? metric.usageCount : 0;
					score += usageCount * 10;
					score = Math.round(score * finalCTR);

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
			if (this.options.source) {
				const remote = await this.options.source.lookup({
					query: term,
					activeOnly: true,
					limit: 50,
				});
				for (const candidate of remote) {
					if (
						!candidate.concept ||
						!candidate.expression ||
						candidate.concept.active === false
					)
						continue;
					if (this.options.filterStore && filterRole) {
						const filters = await this.options.filterStore.listForConceptRole(
							candidate.concept.id,
							filterRole,
						);
						if (!isConceptAllowed(filters, filterRole)) continue;
					}
					candidates.set(candidate.concept.id, {
						concept: candidate.concept,
						score: candidate.score,
						matchedTerms: new Set([candidate.expression.term]),
						exact:
							candidate.matchKind === "exact" ||
							candidate.matchKind === "regex",
						maxTier: 1,
					});
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
				freshness: this.options.freshness ?? "fresh",
				authority: this.options.authority ?? "derived",
				partial: !data.exact,
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
				({
					conceptId,
					concept,
					score,
					matchedTerms,
					sources,
					freshness,
					authority,
					partial,
				}) => ({
					conceptId,
					concept,
					score,
					matchedTerms,
					sources,
					freshness,
					authority,
					partial,
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
