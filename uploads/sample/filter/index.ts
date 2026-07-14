import type {
  FilterState,
  ModifierState,
  ViewState,
  SavedView,
  ToolSchema,
  TableSchema,
  FilterCondition,
  Aggregation
} from "./types";

export class FilterStore {
  private filters = new Map<string, FilterState & { combined?: { operation: string; ids: string[] } }>();
  private modifiers = new Map<string, ModifierState>();
  private views = new Map<string, ViewState>();
  private saved = new Map<string, SavedView>();
  private schemas = new Map<string, ToolSchema>();

  // Mock execution engine registry (will be set from outside to avoid circular dependency)
  private mockExecutor: ((tableName: string, mockData: any[], query: any) => any[]) | null = null;

  constructor() {}

  public registerMockExecutor(executor: (tableName: string, mockData: any[], query: any) => any[]) {
    this.mockExecutor = executor;
  }

  public registerToolSchema(schema: ToolSchema) {
    this.schemas.set(schema.toolName, schema);
  }

  public getParameters(toolName: string, tableName?: string): any {
    const tool = this.schemas.get(toolName);
    if (!tool) return null;

    if (tableName) {
      return {
        toolName,
        tableName,
        ...tool.table_schemas[tableName]
      };
    }

    return tool;
  }

  public init(toolName?: string, tableName?: string): string {
    const filterId = `filter_v1_${toolName ? toolName + "_" : ""}${tableName ? tableName + "_" : ""}${crypto.randomUUID().slice(0, 8)}`;
    
    // Validate if tool and table are provided
    if (toolName) {
      const tool = this.schemas.get(toolName);
      if (!tool) {
        throw new Error(`Tool "${toolName}" is not registered in filter configurations.`);
      }
      if (tableName && !tool.available_tables.includes(tableName)) {
        throw new Error(`Table "${tableName}" is not valid for tool "${toolName}". Available tables: ${tool.available_tables.join(", ")}`);
      }
    }

    this.filters.set(filterId, {
      filterId,
      toolName,
      tableName,
      rules: [],
      createdAt: new Date().toISOString(),
    });

    return filterId;
  }

  /**
   * Retrieves all rules recursively by traversing the parent filter chain.
   */
  public getResolvedRules(filterId: string): FilterCondition[] {
    const rules: FilterCondition[] = [];
    let current = this.filters.get(filterId);
    
    while (current) {
      rules.unshift(...current.rules); // Prepend so older parent rules are first
      if (current.parentFilterId) {
        current = this.filters.get(current.parentFilterId);
      } else {
        break;
      }
    }
    return rules;
  }

  public add(filterId: string, operations: FilterCondition[]): string {
    const parent = this.filters.get(filterId);
    if (!parent) {
      throw new Error(`Filter ID "${filterId}" not found.`);
    }

    const toolName = parent.toolName;
    const tableName = parent.tableName;

    // 1. Schema Validation (fast local check)
    if (toolName && tableName) {
      const tool = this.schemas.get(toolName);
      const schema = tool?.table_schemas[tableName];
      if (schema) {
        for (const op of operations) {
          if (!schema.filterable_properties.includes(op.property)) {
            throw new Error(`Property "${op.property}" is not filterable on table "${tableName}". Allowed: ${schema.filterable_properties.join(", ")}`);
          }
          if (!schema.operators.includes(op.operator)) {
            throw new Error(`Operator "${op.operator}" is not supported on table "${tableName}". Allowed: ${schema.operators.join(", ")}`);
          }
        }
      }
    }

    // Accumulate all rules including new operations
    const accumulatedRules = [...this.getResolvedRules(filterId), ...operations];

    // 2. Mock Execution Validation
    if (toolName && tableName && this.mockExecutor) {
      const tool = this.schemas.get(toolName);
      const schema = tool?.table_schemas[tableName];
      if (schema?.mock_dataset) {
        try {
          // Construct temporary query definition to run against mock dataset
          const query = {
            table: tableName,
            filters: accumulatedRules
          };
          this.mockExecutor(tableName, schema.mock_dataset, query);
        } catch (err: any) {
          throw new Error(`Mock execution validation failed: ${err.message || err}`);
        }
      }
    }

    // Create immutable child filter state
    const newFilterId = `filter_v2_${toolName ? toolName + "_" : ""}${tableName ? tableName + "_" : ""}${crypto.randomUUID().slice(0, 8)}`;
    this.filters.set(newFilterId, {
      filterId: newFilterId,
      toolName,
      tableName,
      rules: operations, // Just store delta; getResolvedRules compiles the full chain
      parentFilterId: filterId,
      createdAt: new Date().toISOString(),
    });

    return newFilterId;
  }

  public getFilter(filterId: string): any {
    const f = this.filters.get(filterId);
    if (!f) return null;

    if (f.combined) {
      return {
        filterId: f.filterId,
        combined: f.combined,
        createdAt: f.createdAt
      };
    }

    return {
      filterId: f.filterId,
      toolName: f.toolName,
      tableName: f.tableName,
      rules: this.getResolvedRules(filterId),
      parentFilterId: f.parentFilterId,
      createdAt: f.createdAt,
    };
  }

  public compress(filterId: string): string {
    const target = this.filters.get(filterId);
    if (!target) {
      throw new Error(`Filter ID "${filterId}" not found.`);
    }

    const resolvedRules = this.getResolvedRules(filterId);
    const compressedId = `filter_compressed_${crypto.randomUUID().slice(0, 8)}`;

    this.filters.set(compressedId, {
      filterId: compressedId,
      toolName: target.toolName,
      tableName: target.tableName,
      rules: resolvedRules,
      parentFilterId: null,
      createdAt: new Date().toISOString(),
    });

    return compressedId;
  }

  public combine(
    operation: "union" | "intersection" | "difference" | "symmetric_difference",
    ids: string[]
  ): string {
    if (ids.length < 2) {
      throw new Error("Combine operation requires at least two filter/view IDs.");
    }

    const combinedId = `combined_${crypto.randomUUID().slice(0, 8)}`;
    this.filters.set(combinedId, {
      filterId: combinedId,
      rules: [],
      combined: {
        operation,
        ids
      },
      createdAt: new Date().toISOString()
    });

    return combinedId;
  }

  public initModifier(filterId?: string | null): string {
    const modId = `mod_v1_${crypto.randomUUID().slice(0, 8)}`;
    this.modifiers.set(modId, {
      modId,
      filterId: filterId || null,
      columns: [],
      aggregations: [],
      createdAt: new Date().toISOString(),
    });
    return modId;
  }

  public modifierAdd(modId: string, columns: string[], aggregations: Aggregation[]): string {
    const parent = this.modifiers.get(modId);
    if (!parent) {
      throw new Error(`Modifier ID "${modId}" not found.`);
    }

    // If modifier is bound to a filter, validate against the filter's table schema
    if (parent.filterId) {
      const filter = this.filters.get(parent.filterId);
      if (filter && filter.toolName && filter.tableName) {
        const tool = this.schemas.get(filter.toolName);
        const schema = tool?.table_schemas[filter.tableName];
        if (schema) {
          // Validate group_by columns
          if (schema.groupable_columns) {
            for (const col of columns) {
              if (!schema.groupable_columns.includes(col)) {
                throw new Error(`Column "${col}" is not groupable on table "${filter.tableName}".`);
              }
            }
          }
          // Validate aggregations
          if (schema.aggregations) {
            for (const agg of aggregations) {
              if (!schema.aggregations.includes(agg.function)) {
                throw new Error(`Aggregation function "${agg.function}" is not supported on table "${filter.tableName}".`);
              }
            }
          }
        }
      }
    }

    const newModId = `mod_v2_${crypto.randomUUID().slice(0, 8)}`;
    this.modifiers.set(newModId, {
      modId: newModId,
      filterId: parent.filterId,
      columns,
      aggregations,
      createdAt: new Date().toISOString(),
    });

    return newModId;
  }

  public getModifier(modId: string): ModifierState | null {
    return this.modifiers.get(modId) || null;
  }

  public initView(
    filterId: string,
    modId?: string | null,
    havingId?: string | null,
    limit?: number,
    offset?: number
  ): string {
    if (!this.filters.has(filterId)) {
      throw new Error(`Filter ID "${filterId}" not found.`);
    }
    if (modId && !this.modifiers.has(modId)) {
      throw new Error(`Modifier ID "${modId}" not found.`);
    }

    const viewId = `view_v1_${crypto.randomUUID().slice(0, 8)}`;
    this.views.set(viewId, {
      viewId,
      filterId,
      modId,
      havingId,
      limit,
      offset,
      createdAt: new Date().toISOString(),
    });

    return viewId;
  }

  public getView(viewId: string): ViewState | null {
    return this.views.get(viewId) || null;
  }

  public saveFilter(id: string, tags: string[], description: string): string {
    if (!this.filters.has(id) && !this.views.has(id)) {
      throw new Error(`Reference ID "${id}" is neither a valid Filter nor a View.`);
    }

    this.saved.set(id, {
      id,
      tags,
      description,
      savedAt: new Date().toISOString(),
    });

    return id;
  }

  public getSaved(id: string): SavedView | null {
    return this.saved.get(id) || null;
  }

  public getAllSaved(): SavedView[] {
    return Array.from(this.saved.values());
  }
}
