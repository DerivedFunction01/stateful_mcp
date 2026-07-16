import type { Concept, CustomExpression, ResolutionMetric } from "./types";

export type ResolutionStatus = 'FOUND' | 'PARTIAL' | 'NOT_FOUND';

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
    concepts: Map<string, Concept>,
    expressions: CustomExpression[],
    metrics: ResolutionMetric[],
    context?: Record<string, any>
  ): Promise<ResolveResponse>;
}

export class InMemoryConceptResolver implements ConceptResolver {
  private matchesContext(exprContext?: Record<string, any>, queryContext?: Record<string, any>): boolean {
    const exprWorkspace = exprContext?.workspace_id || "global";
    const queryWorkspace = queryContext?.workspace_id || "global";
    return exprWorkspace === queryWorkspace;
  }

  public async resolve(
    term: string,
    concepts: Map<string, Concept>,
    expressions: CustomExpression[],
    metrics: ResolutionMetric[],
    context?: Record<string, any>
  ): Promise<ResolveResponse> {
    const candidates = new Map<string, { concept: Concept; score: number; matchedTerms: Set<string>; exact: boolean }>();

    for (const expr of expressions) {
      if (!expr.active || !expr.conceptId) continue;
      if (!this.matchesContext(expr.context, context)) continue;

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
        const concept = concepts.get(expr.conceptId);
        if (concept) {
          let score = expr.priorityWeight;
          const metric = metrics.find(
            (m) =>
              m.expressionId === expr.id &&
              m.conceptId === expr.conceptId &&
              this.matchesContext(m.context, context)
          );
          if (metric) {
            score += metric.usageCount * 10;
          }

          const existing = candidates.get(expr.conceptId);
          if (existing) {
            existing.score += score;
            existing.matchedTerms.add(expr.term);
            if (isExact) existing.exact = true;
          } else {
            candidates.set(expr.conceptId, {
              concept,
              score,
              matchedTerms: new Set([expr.term]),
              exact: isExact
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
        exact: data.exact
      }))
      .sort((a, b) => b.score - a.score);

    const top = sorted[0]!;
    const status: ResolutionStatus = top.exact ? "FOUND" : "PARTIAL";

    return {
      status,
      sources: ["local"],
      results: sorted.map(({ conceptId, concept, score, matchedTerms, sources }) => ({
        conceptId,
        concept,
        score,
        matchedTerms,
        sources
      }))
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
    context?: Record<string, any>
  ): Promise<ResolveResponse> {
    const queryPromises = this.backends.map(async (b) => {
      try {
        const res = await b.resolver.resolve(
          term,
          b.concepts,
          b.expressions,
          b.metrics,
          context
        );
        return {
          backendId: b.config.id,
          weight: b.currentWeight,
          response: res
        };
      } catch (err) {
        return null;
      }
    });

    const responses = (await Promise.all(queryPromises)).filter(
      (r): r is NonNullable<typeof r> => r !== null && r.response.status !== "NOT_FOUND"
    );

    if (responses.length === 0) {
      return { status: "NOT_FOUND", sources: [], results: [] };
    }

    const aggregated = new Map<string, { concept: Concept; score: number; matchedTerms: Set<string>; sources: Set<string> }>();

    for (const resp of responses) {
      for (const res of resp.response.results) {
        const weightedScore = res.score * resp.weight;
        const existing = aggregated.get(res.conceptId);
        if (existing) {
          existing.score += weightedScore;
          res.matchedTerms.forEach(t => existing.matchedTerms.add(t));
          existing.sources.add(resp.backendId);
        } else {
          aggregated.set(res.conceptId, {
            concept: res.concept,
            score: weightedScore,
            matchedTerms: new Set(res.matchedTerms),
            sources: new Set([resp.backendId])
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
        sources: Array.from(data.sources)
      }))
      .sort((a, b) => b.score - a.score);

    const topConceptId = sorted[0]!.conceptId;

    const hasExactWinner = responses.some(
      (resp) => resp.response.status === "FOUND" && resp.response.results[0]?.conceptId === topConceptId
    );

    const status: ResolutionStatus = hasExactWinner ? "FOUND" : "PARTIAL";

    let winningBackendId: string | null = null;
    if (status === "FOUND") {
      const winnerResponse = responses.find(
        (resp) => resp.response.status === "FOUND" && resp.response.results[0]?.conceptId === topConceptId
      );
      if (winnerResponse) {
        winningBackendId = winnerResponse.backendId;
      }
    }

    const responsePayload: ResolveResponse & { _winningBackendId?: string | null } = {
      status,
      sources: Array.from(new Set(responses.map(r => r.backendId))),
      results: sorted
    };

    if (winningBackendId) {
      responsePayload._winningBackendId = winningBackendId;
    }

    return responsePayload;
  }
}
