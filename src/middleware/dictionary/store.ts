import type {
  Namespace,
  Concept,
  ConceptRelation,
  CustomExpression,
  ResolutionMetric,
  DictionaryConfig,
  WorkspaceDefinition
} from "./types";
import type { ConceptResolver, ResolveResult, ResolveResponse } from "./resolver";
import { ErrorCode, McpError } from "../../errors/types";

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

  private verifyNamespaceMutable(namespaceCode: string) {
    const ns = this.namespaces.get(namespaceCode);
    if (ns && ns.isMutable === false) {
      throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, `Namespace "${namespaceCode}" is read-only.`);
    }
  }

  private checkScopeAccess(exprContext: Record<string, any> | undefined, callerContext?: Record<string, any>) {
    if (!callerContext) return;

    const exprWorkspace = exprContext?.workspace_id || "global";
    const exprUserId = exprContext?.user_id;

    if (exprUserId) {
      if (callerContext.user_id !== exprUserId) {
        throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, "Access denied: Cannot modify another user's personal expression.");
      }
    } else if (exprWorkspace === "global") {
      if (!callerContext.is_admin) {
        throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, "Access denied: Insufficient privilege for global scope expressions.");
      }
    } else {
      if (callerContext.workspace_id !== exprWorkspace) {
        throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, `Access denied: Caller workspace "${callerContext.workspace_id}" does not match expression workspace "${exprWorkspace}".`);
      }
    }
  }

  public addConcept(c: Omit<Concept, "id"> & { id?: string }): string {
    this.verifyNamespaceMutable(c.namespaceCode);
    const conceptId = c.id || `concept_dyn_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    if (!conceptId) {
      throw new McpError(ErrorCode.CONCEPT_ALLOCATION_FAILED, "Failed to allocate a valid unique Concept ID.");
    }
    const newConcept: Concept = {
      ...c,
      id: conceptId,
      active: c.active !== false
    };
    this.concepts.set(conceptId, newConcept);
    return conceptId;
  }

  public editConcept(id: string, updates: Partial<Concept>, callerContext?: Record<string, any>) {
    const concept = this.concepts.get(id);
    if (!concept) {
      throw new McpError(ErrorCode.CONCEPT_NOT_FOUND, `Concept "${id}" not found.`);
    }
    this.verifyNamespaceMutable(concept.namespaceCode);

    if (updates.standardCode !== undefined && updates.standardCode !== concept.standardCode) {
      throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, "Cannot edit a concept's standardCode coordinate identity.");
    }
    if (updates.namespaceCode !== undefined && updates.namespaceCode !== concept.namespaceCode) {
      throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, "Cannot edit a concept's namespaceCode coordinate identity.");
    }

    if (updates.display !== undefined) concept.display = updates.display;
    if (updates.description !== undefined) concept.description = updates.description;
    if (updates.designationDate !== undefined) concept.designationDate = updates.designationDate;
    if (updates.active !== undefined) concept.active = updates.active;
  }

  public removeConcept(id: string, callerContext?: Record<string, any>) {
    const concept = this.concepts.get(id);
    if (!concept) {
      throw new McpError(ErrorCode.CONCEPT_NOT_FOUND, `Concept "${id}" not found.`);
    }
    this.verifyNamespaceMutable(concept.namespaceCode);

    const activeExprs = this.expressions.filter(e => e.conceptId === id && e.active);
    if (activeExprs.length > 0) {
      throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, `Cannot remove concept "${id}": it is referenced by active expressions.`);
    }

    const activeRels = this.relations.filter(r => (r.conceptId === id || r.linkedId === id) && r.active);
    if (activeRels.length > 0) {
      throw new McpError(ErrorCode.DICTIONARY_MUTATION_DENIED, `Cannot remove concept "${id}": it is referenced by active relations.`);
    }

    concept.active = false;
    console.error(JSON.stringify({ event: "CONCEPT_DEACTIVATED", id }));
  }

  public getConcept(id: string): Concept | undefined {
    return this.concepts.get(id);
  }

  public addRelation(rel: ConceptRelation) {
    const source = this.concepts.get(rel.conceptId);
    const target = this.concepts.get(rel.linkedId);
    if (source) this.verifyNamespaceMutable(source.namespaceCode);
    if (target) this.verifyNamespaceMutable(target.namespaceCode);

    this.relations.push(rel);
  }

  public removeRelation(id: string, callerContext?: Record<string, any>) {
    const relation = this.relations.find(r => r.id === id);
    if (!relation) {
      throw new McpError(ErrorCode.CONCEPT_NOT_FOUND, `Relation "${id}" not found.`);
    }
    const source = this.concepts.get(relation.conceptId);
    const target = this.concepts.get(relation.linkedId);
    if (source) this.verifyNamespaceMutable(source.namespaceCode);
    if (target) this.verifyNamespaceMutable(target.namespaceCode);

    relation.active = false;
    console.error(JSON.stringify({ event: "RELATION_DEACTIVATED", id }));
  }

  public getRelations(): ConceptRelation[] {
    return this.relations;
  }

  public addExpression(expr: Omit<CustomExpression, "id"> & { id?: string }, callerContext?: Record<string, any>): string {
    this.checkScopeAccess(expr.context, callerContext);

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

  public editExpression(id: string, updates: Partial<CustomExpression>, callerContext?: Record<string, any>) {
    const expr = this.expressions.find(e => e.id === id);
    if (!expr) {
      throw new McpError(ErrorCode.EXPRESSION_INVALID, `Expression "${id}" not found.`);
    }

    this.checkScopeAccess(expr.context, callerContext);
    if (updates.context) {
      this.checkScopeAccess(updates.context, callerContext);
    }

    if (updates.term !== undefined) expr.term = updates.term;
    if (updates.regexPattern !== undefined) expr.regexPattern = updates.regexPattern;
    if (updates.isCaseInsensitive !== undefined) expr.isCaseInsensitive = updates.isCaseInsensitive;
    if (updates.targetAssignment !== undefined) {
      if (this.allowedTargetAssignments && this.allowedTargetAssignments.length > 0) {
        if (!this.allowedTargetAssignments.includes(updates.targetAssignment)) {
          throw new Error(
            `Target assignment "${updates.targetAssignment}" is not in the allowed list of assignments: [${this.allowedTargetAssignments.join(", ")}]`
          );
        }
      }
      expr.targetAssignment = updates.targetAssignment;
    }
    if (updates.conceptId !== undefined) expr.conceptId = updates.conceptId;
    if (updates.priorityWeight !== undefined) expr.priorityWeight = updates.priorityWeight;
    if (updates.active !== undefined) expr.active = updates.active;
    if (updates.context !== undefined) expr.context = updates.context;

    console.error(JSON.stringify({ event: "EXPRESSION_MODIFIED", id }));
  }

  public removeExpression(id: string, callerContext?: Record<string, any>): boolean {
    const index = this.expressions.findIndex((e) => e.id === id);
    if (index === -1) return false;
    const expr = this.expressions[index]!;

    this.checkScopeAccess(expr.context, callerContext);

    const hasMetrics = this.metrics.some(m => m.expressionId === id && m.usageCount > 0);
    if (hasMetrics) {
      expr.active = false;
      console.error(JSON.stringify({ event: "EXPRESSION_DEACTIVATED", id }));
      return true;
    } else {
      this.expressions.splice(index, 1);
      console.error(JSON.stringify({ event: "EXPRESSION_REMOVED", id }));
      return true;
    }
  }

  public getExpressions(): CustomExpression[] {
    return this.expressions;
  }

  private getExpressionScopeLevel(exprContext?: Record<string, any>): "user" | "workspace" | "global" {
    if (exprContext?.user_id) return "user";
    if (exprContext?.workspace_id && exprContext.workspace_id !== "global") return "workspace";
    return "global";
  }

  private matchesContext(exprContext?: Record<string, any>, queryContext?: Record<string, any>): boolean {
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
    context?: Record<string, any>
  ): Promise<ResolveResponse> {
    const result = await this.resolver.resolve(
      term,
      this.concepts,
      this.expressions,
      this.metrics,
      context
    );

    if (result.status === "FOUND" && result.results.length > 0) {
      const top = result.results[0]!;
      const matchingExpr = this.expressions.find(
        (e) => e.conceptId === top.conceptId && top.matchedTerms.includes(e.term)
      );
      if (matchingExpr) {
        this.recordUsage(matchingExpr.id, top.conceptId, context || {});
      }
    }

    const winningBackendId = (result as any)._winningBackendId;
    if (winningBackendId && typeof (this.resolver as any).adjustWeight === "function") {
      (this.resolver as any).adjustWeight(winningBackendId, 0.05); // Reward winner
      if (typeof (this.resolver as any).getBackends === "function") {
        const backends = (this.resolver as any).getBackends();
        for (const b of backends) {
          if (b.config.id !== winningBackendId) {
            (this.resolver as any).adjustWeight(b.config.id, -0.01); // Decay losers
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
