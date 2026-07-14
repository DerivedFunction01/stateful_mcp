import type {
  Namespace,
  Concept,
  ConceptRelation,
  CustomExpression,
  ResolutionMetric,
  DictionaryConfig
} from "./types";
import type { ConceptResolver, ResolveResult } from "./resolver";

export class DictionaryStore {
  private namespaces = new Map<string, Namespace>();
  private concepts = new Map<string, Concept>();
  private relations: ConceptRelation[] = [];
  private expressions: CustomExpression[] = [];
  private metrics: ResolutionMetric[] = [];

  constructor(private resolver: ConceptResolver) {}

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
    const id = expr.id || `expr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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

  private matchesContext(exprContext?: Record<string, any>, queryContext?: Record<string, any>): boolean {
    const exprWorkspace = exprContext?.workspace_id || "global";
    const queryWorkspace = queryContext?.workspace_id || "global";
    return exprWorkspace === queryWorkspace;
  }

  public async resolve(
    term: string,
    context?: Record<string, any>
  ): Promise<ResolveResult | null> {
    const result = await this.resolver.resolve(
      term,
      this.concepts,
      this.expressions,
      this.metrics,
      context
    );

    if (result) {
      this.recordUsage(result.expression.id, result.conceptId, context || {});
    }

    return result;
  }

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
