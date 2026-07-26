import type { FilterCondition } from "../../../middleware/filter/types";
import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EntityConfig } from "./entity-config";

export const filterDdlKeys = {
	ddl: [
		"DDL_FILTERS",
		"DDL_FILTER_RULES",
		"DDL_SAVED_FILTERS",
		"DDL_SESSION_ALIASES",
	],
	ddlIndexes: ["IDX_FILTERS_SESSION", "IDX_FILTERS_SCOPE"],
};

function makeFilterRulesChild(_dialect: SqlDialect) {
	return {
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
			value: typeof row.value === "string" ? JSON.parse(row.value) : row.value,
		}),
	};
}

function makeFilterEntityConfig(_dialect: SqlDialect): EntityConfig<any, any> {
	const jsonParse = (v: any) => {
		if (v === null || v === undefined) return null;
		if (typeof v === "string" && v === "") return null;
		if (typeof v !== "string") return v;
		return JSON.parse(v);
	};

	const jsonStringify = (v: any) => {
		if (v === null || v === undefined) return null;
		return JSON.stringify(v);
	};

	return {
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
			combined_ids: jsonStringify(state.combined_ids),
			schema_snapshot: jsonStringify(state.schema_snapshot),
		}),

		rowToSession: (row: Record<string, any>) => ({
			filterId: row.filter_id,
			toolName: row.tool_name || undefined,
			tableName: row.table_name || undefined,
			rules: [] as FilterCondition[],
			parentFilterId: row.parent_filter_id,
			createdAt: row.created_at,
			combined_operation: row.combined_operation || undefined,
			combined_ids: jsonParse(row.combined_ids),
			schema_snapshot: jsonParse(row.schema_snapshot),
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
			combined_ids: jsonStringify(state.combined_ids),
			schema_snapshot: jsonStringify(state.schema_snapshot),
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
			combined_ids: jsonParse(row.combined_ids),
			tags: jsonParse(savedRow!.tags),
			description: savedRow!.description,
			schema_snapshot: jsonParse(row.schema_snapshot) ?? "{}",
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

		children: [makeFilterRulesChild(_dialect)],
	};
}

export const filterEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
	sqlite: makeFilterEntityConfig("sqlite"),
	postgres: makeFilterEntityConfig("postgres"),
	duckdb: makeFilterEntityConfig("duckdb"),
	opfs: makeFilterEntityConfig("sqlite"),
};
