import type { Concept, CustomExpression, ResolutionMetric } from "./types";

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
  ): Promise<ResolveResult | null>;
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
  ): Promise<ResolveResult | null> {
    const candidates: Array<{
      expr: CustomExpression;
      concept: Concept;
      score: number;
    }> = [];

    for (const expr of expressions) {
      if (!expr.active || !expr.conceptId) continue;
      if (!this.matchesContext(expr.context, context)) continue;

      let matched = false;
      try {
        const flags = expr.isCaseInsensitive ? "i" : "";
        const regex = new RegExp(expr.regexPattern, flags);
        if (regex.test(term)) {
          matched = true;
        }
      } catch (err) {
        if (term.toLowerCase().includes(expr.term.toLowerCase())) {
          matched = true;
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

          candidates.push({ expr, concept, score });
        }
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;

    return {
      conceptId: best.expr.conceptId!,
      concept: best.concept,
      expression: best.expr,
      score: best.score
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
  ): Promise<ResolveResult | null> {
    const queryPromises = this.backends.map(async (b) => {
      try {
        const res = await b.resolver.resolve(
          term,
          b.concepts,
          b.expressions,
          b.metrics,
          context
        );
        if (!res) return null;
        return {
          backendId: b.config.id,
          weight: b.currentWeight,
          result: res
        };
      } catch (err) {
        return null;
      }
    });

    const responses = (await Promise.all(queryPromises)).filter(
      (r): r is NonNullable<typeof r> => r !== null
    );

    if (responses.length === 0) return null;

    const aggregated = new Map<string, { result: ResolveResult; score: number; backendId: string }>();

    for (const resp of responses) {
      const weightedScore = resp.result.score * resp.weight;
      const existing = aggregated.get(resp.result.conceptId);
      if (existing) {
        existing.score += weightedScore;
      } else {
        aggregated.set(resp.result.conceptId, {
          result: resp.result,
          score: weightedScore,
          backendId: resp.backendId
        });
      }
    }

    const sorted = Array.from(aggregated.values()).sort((a, b) => b.score - a.score);
    const best = sorted[0]!;

    // Tag the best result's expression context with the winning backend ID
    best.result.expression.context = {
      ...best.result.expression.context,
      resolved_backend_id: best.backendId
    };

    return {
      ...best.result,
      score: best.score
    };
  }
}
