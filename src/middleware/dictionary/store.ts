import type {
  Namespace,
  Concept,
  ConceptRelation,
  CustomExpression,
  ResolutionMetric,
  DictionaryConfig,
  WorkspaceDefinition
} from "./types";
import type { ConceptResolver, ResolveResult } from "./resolver";

export class DictionaryStore {
  private namespaces = new Map<string, Namespace>();
  private concepts = new Map<string, Concept>();
  private relations: ConceptRelation[] = [];
  private expressions: CustomExpression[] = [];
  private metrics: ResolutionMetric[] = [];
  private allowedTargetAssignments?: string[];
  private workspaces: WorkspaceDefinition[] = [];
  private allowedTags?: string[];
  private exposeTagsAsEnum = false;
  private defaultDynamicNamespace = "CUSTOM";
  private defaultWorkspaceId = "global";
  private exposeWorkspaceAsEnum = false;

  constructor(private resolver: ConceptResolver) {}

  public loadConfig(config: DictionaryConfig) {
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
    this.defaultWorkspaceId = config.defaultWorkspaceId || process.env.WORKSPACE_ID || "global";
    if (config.defaultDynamicNamespace) {
      this.defaultDynamicNamespace = config.defaultDynamicNamespace;
    }
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

  public shouldExposeWorkspaceAsEnum(): boolean {
    return this.exposeWorkspaceAsEnum;
  }

  public getDefaultWorkspace(): string {
    return this.defaultWorkspaceId;
  }

  public getWorkspaces(): WorkspaceDefinition[] {
    return this.workspaces;
  }

  public resolveConceptId(ref: string): string | undefined {
    if (ref.includes("::")) {
      const idx = ref.indexOf("::");
      const ns = ref.slice(0, idx);
      const code = ref.slice(idx + 2);
      for (const concept of this.concepts.values()) {
        if (concept.namespaceCode === ns && concept.standardCode === code) {
          return concept.id;
        }
      }
      return undefined;
    }
    if (this.concepts.has(ref)) {
      return ref;
    }
    return undefined;
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
    if (this.allowedTargetAssignments && this.allowedTargetAssignments.length > 0) {
      if (!this.allowedTargetAssignments.includes(expr.targetAssignment)) {
        throw new Error(
          `Target assignment "${expr.targetAssignment}" is not in the allowed list of assignments: [${this.allowedTargetAssignments.join(", ")}]`
        );
      }
    }
    const workspaceId = expr.context?.workspace_id || "global";
    if (this.workspaces.length > 0 && workspaceId !== "global") {
      const exists = this.workspaces.some((w) => w.id === workspaceId);
      if (!exists) {
        throw new Error(`Workspace "${workspaceId}" is not in the configured workspaces list.`);
      }
    }
    const tags = expr.context?.tags;
    if (this.allowedTags && this.allowedTags.length > 0 && Array.isArray(tags)) {
      for (const t of tags) {
        if (!this.allowedTags.includes(t)) {
          throw new Error(
            `Tag "${t}" is not in the configured allowed tags list: [${this.allowedTags.join(", ")}].`
          );
        }
      }
    }
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
      const backendId = result.expression.context?.resolved_backend_id;
      if (backendId && typeof (this.resolver as any).adjustWeight === "function") {
        (this.resolver as any).adjustWeight(backendId, 0.05); // Reward winner
        if (typeof (this.resolver as any).getBackends === "function") {
          const backends = (this.resolver as any).getBackends();
          for (const b of backends) {
            if (b.config.id !== backendId) {
              (this.resolver as any).adjustWeight(b.config.id, -0.01); // Decay losers
            }
          }
        }
      }
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
