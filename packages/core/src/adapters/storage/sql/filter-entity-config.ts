import type { FilterCondition } from "../../../middleware/filter/types";
import type { PersistedFilterState } from "../interfaces";
import type { EntityConfig } from "./entity-config";

export const filterDdlKeys = {
  ddl: ["DDL_FILTERS", "DDL_FILTER_RULES", "DDL_SAVED_FILTERS", "DDL_SESSION_ALIASES"],
  ddlIndexes: ["IDX_FILTERS_SESSION", "IDX_FILTERS_SCOPE"],
};

const filterRulesChild = {
  table: "filter_rules",
  parentIdColumn: "filter_id",
  orderColumn: "index_order",
  stateField: "rules" as const,
  toRow: (rule: FilterCondition, index: number, parentId: string) => ({
    filter_id: parentId,
    property: rule.property,
    operator: rule.operator,
    value: JSON.stringify(rule.value),
    index_order: index,
  }),
  fromRow: (row: Record<string, any>) => ({
    property: row.property,
    operator: row.operator,
    value: JSON.parse(row.value),
  }),
};

export const filterEntityConfig: EntityConfig<any, any> = {
  idPrefix: "filter_",
  idField: "filter_id",
  parentIdColumn: "parent_filter_id",
  sessionTable: "filters",
  savedTable: "saved_filters",
  aliasTable: "session_aliases",

  sessionToRow: (id: string, sessionId: string, state: any) => ({
    filter_id: id,
    tool_name: state.toolName || null,
    table_name: state.tableName || null,
    parent_filter_id: state.parentFilterId || null,
    scope_level: "session",
    session_id: sessionId,
    user_id: null,
    combined_operation: state.combined_operation || null,
    combined_ids: state.combined_ids ? JSON.stringify(state.combined_ids) : null,
    schema_snapshot: state.schema_snapshot
      ? JSON.stringify(state.schema_snapshot)
      : null,
  }),

  rowToSession: (row: Record<string, any>) => ({
    filterId: row.filter_id,
    toolName: row.tool_name || undefined,
    tableName: row.table_name || undefined,
    rules: [] as FilterCondition[],
    parentFilterId: row.parent_filter_id,
    createdAt: row.created_at,
    combined_operation: row.combined_operation || undefined,
    combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
    schema_snapshot: row.schema_snapshot
      ? JSON.parse(row.schema_snapshot)
      : null,
  }),

  persistentToRow: (
    id: string,
    scope: { level: string; userId?: string | null },
    state: any,
  ) => ({
    filter_id: id,
    tool_name: state.toolName || null,
    table_name: state.tableName || null,
    parent_filter_id: state.parentFilterId || null,
    scope_level: scope.level,
    session_id: null,
    user_id: scope.level === "user" ? scope.userId : null,
    combined_operation: state.combined_operation || null,
    combined_ids: state.combined_ids ? JSON.stringify(state.combined_ids) : null,
    schema_snapshot: state.schema_snapshot,
  }),

  rowToPersistent: (
    row: Record<string, any>,
    savedRow: Record<string, any> | null,
  ) => ({
    filterId: row.filter_id,
    toolName: row.tool_name || undefined,
    tableName: row.table_name || undefined,
    rules: [] as FilterCondition[],
    parentFilterId: row.parent_filter_id,
    createdAt: row.created_at,
    combined_operation: row.combined_operation || undefined,
    combined_ids: row.combined_ids ? JSON.parse(row.combined_ids) : null,
    tags: JSON.parse(savedRow!.tags),
    description: savedRow!.description,
    schema_snapshot: row.schema_snapshot
      ? JSON.parse(row.schema_snapshot)
      : "{}",
  }),

  savedToRow: (
    id: string,
    scope: { level: string; userId?: string | null },
    state: any,
  ) => ({
    id,
    tags: JSON.stringify(state.tags),
    description: state.description,
    scope_level: scope.level,
    user_id: scope.level === "user" ? scope.userId : null,
  }),

  children: [filterRulesChild],
};