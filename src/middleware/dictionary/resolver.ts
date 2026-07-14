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
