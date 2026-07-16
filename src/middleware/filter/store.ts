import type { SessionFilterStore, PersistentFilterStore } from "../../adapters/storage/interfaces";
import type { FilterState, FilterCondition } from "./types";
import type { TableSchema, OwnerScope } from "../../config/types";
import type { QueryEngine } from "../../adapters/engines/interfaces";
import { ErrorCode, McpError } from "../../errors/types";

export class FilterStore {
  private modifiers = new Map<string, { modId: string; filterId: string | null; columns: string[]; aggregations: any[]; createdAt: string }>();
  private views = new Map<string, { viewId: string; filterId: string; modId?: string | null; havingId?: string | null; limit?: number; offset?: number; createdAt: string }>();

  constructor(
    private session: SessionFilterStore,
    private persistent: PersistentFilterStore,
    private toolSchemas: Map<string, Record<string, TableSchema>>,
    private pinnedSchemas: Map<string, TableSchema>
  ) {}

  private async lookup(id: string, sessionId: string, userId?: string): Promise<FilterState | null> {
    const fromSession = await this.session.get(sessionId, id);
    if (fromSession) return fromSession;

    const fromPersistent = (userId ? await this.persistent.get(id, { level: "user", userId }) : null) ??
                           await this.persistent.get(id, { level: "global" });
    
    if (fromPersistent) {
      let parsedSchema = null;
      if (fromPersistent.schema_snapshot) {
        try {
          parsedSchema = JSON.parse(fromPersistent.schema_snapshot);
        } catch (_) {}
      }
      return {
        ...fromPersistent,
        schema_snapshot: parsedSchema
      } as FilterState;
    }

    return null;
  }

  private getPropertyType(schema: TableSchema, property: string): string | undefined {
    if (schema.mock_dataset && schema.mock_dataset.length > 0) {
      const firstRow = schema.mock_dataset[0];
      if (firstRow && firstRow[property] !== undefined && firstRow[property] !== null) {
        return typeof firstRow[property];
      }
    }
    return undefined;
  }

  async getFilter(id: string, sessionId: string, userId?: string): Promise<FilterState | null> {
    return this.lookup(id, sessionId, userId);
  }

  async init(sessionId: string, toolName?: string, tableName?: string): Promise<string> {
    if (toolName) {
      const tables = this.toolSchemas.get(toolName);
      if (!tables) {
        throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Tool "${toolName}" not registered`);
      }
      if (tableName && !tables[tableName]) {
        throw new McpError(ErrorCode.FILTER_PROPERTY_INVALID, `Table "${tableName}" not in tool "${toolName}"`);
      }
    }

    const filterId = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const schema = toolName && tableName ? this.toolSchemas.get(toolName)?.[tableName] : undefined;

    const state: FilterState = {
      filterId,
      toolName,
      tableName,
      rules: [],
      parentFilterId: null,
      createdAt: new Date().toISOString(),
      schema_snapshot: schema
    };

    await this.session.set(sessionId, filterId, state);
    if (schema) {
      this.pinnedSchemas.set(filterId, schema);
    }

    return filterId;
  }

  async add(
    filterId: string,
    operations: FilterCondition[],
    sessionId: string,
    userId?: string
  ): Promise<string> {
    const parent = await this.lookup(filterId, sessionId, userId);
    if (!parent) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not found`);
    }

    const schema = this.pinnedSchemas.get(filterId);

    // Schema validation against public property names / allowed operators
    if (schema) {
      for (const op of operations) {
        if (!schema.filterable_properties.includes(op.property)) {
          throw new McpError(
            ErrorCode.FILTER_PROPERTY_INVALID,
            `"${op.property}" is not filterable on "${parent.tableName}"`,
            { allowed: schema.filterable_properties }
          );
        }
        if (!schema.operators.includes(op.operator)) {
          throw new McpError(
            ErrorCode.FILTER_OPERATOR_INVALID,
            `Operator "${op.operator}" not allowed on "${parent.tableName}"`,
            { allowed: schema.operators }
          );
        }

        // Basic type-aware constraints
        const propType = this.getPropertyType(schema, op.property);
        if (propType === "number") {
          if (op.operator === "like" || op.operator === "not_like") {
            throw new McpError(
              ErrorCode.FILTER_OPERATOR_INVALID,
              `Operator "${op.operator}" is not allowed on numeric property "${op.property}"`
            );
          }
        } else if (propType === "string" || propType === "boolean") {
          if (op.operator === "between" || op.operator === "not_between") {
            throw new McpError(
              ErrorCode.FILTER_OPERATOR_INVALID,
              `Operator "${op.operator}" is not allowed on non-numeric property "${op.property}"`
            );
          }
        }
      }
    }

    const newId = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const newState: FilterState = {
      filterId: newId,
      toolName: parent.toolName,
      tableName: parent.tableName,
      rules: operations,
      parentFilterId: filterId,
      createdAt: new Date().toISOString(),
      schema_snapshot: schema
    };

    await this.session.set(sessionId, newId, newState);
    if (schema) {
      this.pinnedSchemas.set(newId, schema);
    }

    return newId;
  }

  async getFilterRules(id: string, sessionId: string, userId?: string): Promise<FilterCondition[]> {
    const filter = await this.lookup(id, sessionId, userId);
    if (!filter) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${id}" not found`);
    }
    const rules = [...filter.rules];
    let parentId = filter.parentFilterId;
    while (parentId) {
      const parent = await this.lookup(parentId, sessionId, userId);
      if (!parent) break;
      rules.unshift(...parent.rules); // Parent rules are applied first
      parentId = parent.parentFilterId;
    }
    return rules;
  }

  async compress(filterId: string, sessionId: string, userId?: string): Promise<string> {
    const filter = await this.lookup(filterId, sessionId, userId);
    if (!filter) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not found`);
    }
    if (filter.combined_operation) {
      throw new McpError(ErrorCode.FILTER_COMBINATION_INVALID, "Combined filters cannot be compressed");
    }

    const flatRules = await this.getFilterRules(filterId, sessionId, userId);
    const compressedId = `filter_comp_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const compressedState: FilterState = {
      filterId: compressedId,
      toolName: filter.toolName,
      tableName: filter.tableName,
      rules: flatRules,
      parentFilterId: null,
      createdAt: new Date().toISOString(),
      schema_snapshot: filter.schema_snapshot
    };

    await this.session.set(sessionId, compressedId, compressedState);
    const schema = this.pinnedSchemas.get(filterId);
    if (schema) {
      this.pinnedSchemas.set(compressedId, schema);
    }

    return compressedId;
  }

  async combine(
    operation: "union" | "intersection" | "difference" | "symmetric_difference",
    ids: string[],
    sessionId: string,
    userId?: string
  ): Promise<string> {
    if (ids.length < 2) {
      throw new McpError(ErrorCode.FILTER_COMBINATION_INVALID, "Need at least 2 filter IDs to combine");
    }

    let boundTool: string | undefined;
    let boundTable: string | undefined;

    for (const id of ids) {
      const f = await this.lookup(id, sessionId, userId);
      if (!f) {
        throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${id}" not found`);
      }
      if (f.toolName && f.tableName) {
        if (!boundTool) {
          boundTool = f.toolName;
          boundTable = f.tableName;
        } else if (boundTool !== f.toolName || boundTable !== f.tableName) {
          throw new McpError(
            ErrorCode.FILTER_COMBINATION_INVALID,
            "Cannot combine filters targeting different tools/tables"
          );
        }
      }
    }

    const combinedId = `filter_comb_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const combinedState: FilterState = {
      filterId: combinedId,
      toolName: boundTool,
      tableName: boundTable,
      rules: [],
      parentFilterId: null,
      combined_operation: operation,
      combined_ids: ids,
      createdAt: new Date().toISOString()
    };

    await this.session.set(sessionId, combinedId, combinedState);
    return combinedId;
  }

  async save(
    filterId: string,
    tags: string[],
    description: string,
    scope: OwnerScope,
    sessionId: string,
    checkPrivilege: (userId?: string) => boolean
  ): Promise<string> {
    if (scope.level === "global") {
      if (!checkPrivilege(undefined)) {
        throw new McpError(ErrorCode.FILTER_PRIVILEGE_DENIED, "Insufficient privilege for global scope");
      }
    }

    const state = await this.session.get(sessionId, filterId);
    if (!state) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not in session`);
    }
    if (state.parentFilterId !== null) {
      throw new McpError(ErrorCode.FILTER_SCOPE_INVALID, "Compress the filter before saving");
    }

    const schema = this.pinnedSchemas.get(filterId);
    await this.persistent.set(
      filterId,
      {
        ...state,
        tags,
        description,
        schema_snapshot: JSON.stringify(schema ?? null),
      },
      scope
    );

    return filterId;
  }

  async resolveRows(
    filterId: string,
    sessionId: string,
    userId?: string,
    queryEngineResolver?: (toolName: string, tableName: string) => Promise<QueryEngine>
  ): Promise<any[]> {
    const filter = await this.lookup(filterId, sessionId, userId);
    if (!filter) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not found`);
    }

    if (filter.combined_operation && filter.combined_ids) {
      const results: any[][] = [];
      for (const cid of filter.combined_ids) {
        const rows = await this.resolveRows(cid, sessionId, userId, queryEngineResolver);
        results.push(rows);
      }

      if (results.length === 0) return [];
      
      const op = filter.combined_operation;
      let combined = results[0]!;
      const getRowKey = (r: any) => r.id || JSON.stringify(r);

      for (let i = 1; i < results.length; i++) {
        const next = results[i]!;
        const combinedKeys = new Set(combined.map(getRowKey));
        const nextKeys = new Set(next.map(getRowKey));

        if (op === "union") {
          const merged = [...combined];
          for (const row of next) {
            if (!combinedKeys.has(getRowKey(row))) {
              merged.push(row);
            }
          }
          combined = merged;
        } else if (op === "intersection") {
          combined = combined.filter(row => nextKeys.has(getRowKey(row)));
        } else if (op === "difference") {
          combined = combined.filter(row => !nextKeys.has(getRowKey(row)));
        } else if (op === "symmetric_difference") {
          const symDiff: any[] = [];
          for (const row of combined) {
            if (!nextKeys.has(getRowKey(row))) {
              symDiff.push(row);
            }
          }
          for (const row of next) {
            if (!combinedKeys.has(getRowKey(row))) {
              symDiff.push(row);
            }
          }
          combined = symDiff;
        }
      }
      return combined;
    }

    if (!filter.toolName || !filter.tableName) {
      throw new McpError(ErrorCode.FILTER_COMBINATION_INVALID, "Filter not bound to a tool/table");
    }

    if (!queryEngineResolver) {
      throw new McpError(ErrorCode.INTERNAL_ERROR, "QueryEngine resolver not provided");
    }

    const engine = await queryEngineResolver(filter.toolName, filter.tableName);
    const flatRules = await this.getFilterRules(filterId, sessionId, userId);
    
    return engine.execute(filter.tableName, {
      table: filter.tableName,
      filters: flatRules
    });
  }

  public getParameters(toolName: string, tableName?: string): any {
    const tool = this.toolSchemas.get(toolName);
    if (!tool) return null;

    if (tableName) {
      const tableSchema = tool[tableName];
      if (!tableSchema) return null;
      return {
        toolName,
        tableName,
        ...tableSchema
      };
    }

    return {
      toolName,
      available_tables: Object.keys(tool),
      table_schemas: tool
    };
  }

  public initModifier(filterId?: string | null): string {
    const modId = `mod_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    this.modifiers.set(modId, {
      modId,
      filterId: filterId || null,
      columns: [],
      aggregations: [],
      createdAt: new Date().toISOString()
    });
    return modId;
  }

  public modifierAdd(modId: string, columns: string[], aggregations: any[]): string {
    const parent = this.modifiers.get(modId);
    if (!parent) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Modifier ID "${modId}" not found`);
    }

    const newModId = `mod_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    this.modifiers.set(newModId, {
      modId: newModId,
      filterId: parent.filterId,
      columns,
      aggregations,
      createdAt: new Date().toISOString()
    });
    return newModId;
  }

  public initView(
    filterId: string,
    modId?: string | null,
    havingId?: string | null,
    limit?: number,
    offset?: number
  ): string {
    const viewId = `view_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    this.views.set(viewId, {
      viewId,
      filterId,
      modId,
      havingId,
      limit,
      offset,
      createdAt: new Date().toISOString()
    });
    return viewId;
  }

  public getView(viewId: string): any {
    return this.views.get(viewId) || null;
  }

  public async removeRule(
    filterId: string,
    property: string,
    operator: string,
    sessionId: string,
    userId?: string
  ): Promise<string> {
    const parent = await this.lookup(filterId, sessionId, userId);
    if (!parent) {
      throw new McpError(ErrorCode.FILTER_NOT_FOUND, `Filter "${filterId}" not found`);
    }

    const resolvedRules = await this.getFilterRules(filterId, sessionId, userId);
    const filteredRules = resolvedRules.filter(
      (r) => !(r.property === property && r.operator === operator)
    );

    const newId = `filter_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const newState: FilterState = {
      filterId: newId,
      toolName: parent.toolName,
      tableName: parent.tableName,
      rules: filteredRules,
      parentFilterId: null,
      createdAt: new Date().toISOString(),
      schema_snapshot: parent.schema_snapshot
    };

    await this.session.set(sessionId, newId, newState);
    
    const schema = this.pinnedSchemas.get(filterId);
    if (schema) {
      this.pinnedSchemas.set(newId, schema);
    }

    return newId;
  }
}
