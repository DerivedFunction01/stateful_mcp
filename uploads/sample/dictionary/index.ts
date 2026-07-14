import type {
  Namespace,
  Concept,
  ConceptRelation,
  CustomExpression,
  ResolutionMetric,
  DictionaryConfig
} from "./types";

export class DictionaryStore {
  private namespaces = new Map<string, Namespace>();
  private concepts = new Map<string, Concept>();
  private relations: ConceptRelation[] = [];
  private expressions: CustomExpression[] = [];
  private metrics: ResolutionMetric[] = [];

  constructor() {}

  public loadConfig(config: DictionaryConfig) {
    if (config.namespaces) {
      for (const ns of config.namespaces) {
        this.namespaces.set(ns.code, ns);
      }
    }
    if (config.concepts) {
      for (const c of config.concepts) {
        this.concepts.set(c.id, c);
      }
    }
    if (config.relations) {
      this.relations = [...this.relations, ...config.relations];
    }
    if (config.expressions) {
      for (const expr of config.expressions) {
        this.addExpression(expr);
      }
    }
  }

  public addNamespace(ns: Namespace) {
    this.namespaces.set(ns.code, ns);
  }

  public getNamespace(code: string): Namespace | undefined {
    return this.namespaces.get(code);
  }

  public addConcept(c: Concept) {
    this.concepts.set(c.id, c);
  }

  public getConcept(id: string): Concept | undefined {
    return this.concepts.get(id);
  }

  public addRelation(rel: ConceptRelation) {
    this.relations.push(rel);
  }

  public getRelations(): ConceptRelation[] {
    return this.relations;
  }

  public addExpression(expr: Omit<CustomExpression, "id"> & { id?: string }): string {
    const id = expr.id || crypto.randomUUID();
    const newExpr: CustomExpression = {
      ...expr,
      id,
      active: expr.active ?? true,
      priorityWeight: expr.priorityWeight ?? 1
    };
    this.expressions.push(newExpr);
    return id;
  }

  public removeExpression(id: string): boolean {
    const index = this.expressions.findIndex((e) => e.id === id);
    if (index !== -1) {
      this.expressions.splice(index, 1);
      return true;
    }
    return false;
  }

  public getExpressions(): CustomExpression[] {
    return this.expressions;
  }

  /**
   * Helper to determine if expression context matches query context.
   * If expression context is omitted or empty, it matches any context (fallback).
   * Otherwise, every key in expression.context must match the query context.
   */
  private matchesContext(exprContext?: Record<string, any>, queryContext?: Record<string, any>): boolean {
    const exprWorkspace = exprContext?.workspace_id || "global";
    const queryWorkspace = queryContext?.workspace_id || "global";
    return exprWorkspace === queryWorkspace;
  }

  /**
   * Resolve an alias/term using regex or substring matching.
   * Leverages priority weights and usage counts for scoring.
   */
  public resolve(
    term: string,
    context?: Record<string, any>
  ): { conceptId: string; concept: Concept; expression: CustomExpression; score: number } | null {
    const candidates: Array<{
      expr: CustomExpression;
      concept: Concept;
      score: number;
    }> = [];

    for (const expr of this.expressions) {
      if (!expr.active || !expr.conceptId) continue;
      if (!this.matchesContext(expr.context, context)) continue;

      let matched = false;
      // Compile regex or match literally
      try {
        const flags = expr.isCaseInsensitive ? "i" : "";
        const regex = new RegExp(expr.regexPattern, flags);
        if (regex.test(term)) {
          matched = true;
        }
      } catch (err) {
        // Fallback to substring matching if regex is invalid
        if (term.toLowerCase().includes(expr.term.toLowerCase())) {
          matched = true;
        }
      }

      if (matched) {
        const concept = this.concepts.get(expr.conceptId);
        if (concept) {
          // Calculate score based on priority weight + usage metrics
          let score = expr.priorityWeight;
          const metric = this.metrics.find(
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

    // Pick highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) return null;

    // Automatically record usage
    this.recordUsage(best.expr.id, best.expr.conceptId!, context || {});

    return {
      conceptId: best.expr.conceptId!,
      concept: best.concept,
      expression: best.expr,
      score: best.score,
    };
  }

  /**
   * Find expression mappings.
   */
  public find(
    query: { term?: string; tags?: string[]; conceptType?: string },
    context?: Record<string, any>
  ): CustomExpression[] {
    return this.expressions.filter((expr) => {
      if (!expr.active) return false;
      if (!this.matchesContext(expr.context, context)) return false;

      if (query.term) {
        const matchesTerm = expr.term.toLowerCase().includes(query.term.toLowerCase());
        const matchesPattern = expr.regexPattern.toLowerCase().includes(query.term.toLowerCase());
        if (!matchesTerm && !matchesPattern) return false;
      }

      if (query.tags && query.tags.length > 0) {
        const exprTags = expr.context?.tags;
        if (!Array.isArray(exprTags)) return false;
        const hasAllTags = query.tags.every((t) => exprTags.includes(t));
        if (!hasAllTags) return false;
      }

      if (query.conceptType) {
        const concept = expr.conceptId ? this.concepts.get(expr.conceptId) : null;
        if (!concept || concept.namespaceCode.toLowerCase() !== query.conceptType.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Record a resolution usage to boost future match score.
   */
  public recordUsage(expressionId: string, conceptId: string, context: Record<string, any>) {
    const existing = this.metrics.find(
      (m) =>
        m.expressionId === expressionId &&
        m.conceptId === conceptId &&
        JSON.stringify(m.context) === JSON.stringify(context)
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
