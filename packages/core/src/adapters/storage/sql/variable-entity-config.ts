import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EntityConfig } from "./entity-config";

export const variableDdlKeys = {
	ddl: ["DDL_VARIABLES", "DDL_SAVED_VARIABLES", "DDL_VARIABLE_SESSION_ALIASES"],
	ddlIndexes: ["IDX_VARIABLES_SESSION"],
};

function makeVariableEntityConfig(dialect: SqlDialect): EntityConfig<any, any> {
	const isPg = dialect === "postgres";
	const isDuck = dialect === "duckdb";

	const jsonParse = (v: any) => {
		if (v === null || v === undefined) return null;
		if (typeof v === "string" && v === "") return null;
		if (isDuck) return JSON.parse(String(v));
		return JSON.parse(v);
	};

	const jsonStringify = (v: any) => {
		if (v === null || v === undefined) return null;
		if (isPg) return v;
		return JSON.stringify(v);
	};

	return {
		idPrefix: "var_",
		idField: "var_key",
		sessionTable: "variables",
		savedTable: "saved_variables",
		aliasTable: "variable_session_aliases",

		sessionToRow: (key: string, sessionId: string, state: any) => ({
			var_key: key,
			session_id: sessionId,
			scope_level: "session",
			var_value: jsonStringify(state.value),
			block_instance_id: state.blockInstanceId || null,
		}),

		rowToSession: (row: Record<string, any>) => ({
			var_key: row.var_key,
			value: jsonParse(row.var_value),
			blockInstanceId: row.block_instance_id || undefined,
		}),

		persistentToRow: (
			key: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			var_key: key,
			scope_level: scope.level,
			session_id: null,
			user_id: scope.level === "user" ? scope.userId : null,
			var_value: jsonStringify(state.value),
			block_instance_id: state.blockInstanceId || null,
		}),

		rowToPersistent: (
			row: Record<string, any>,
			savedRow: Record<string, any> | null,
		) => ({
			var_key: row.var_key,
			value: jsonParse(row.var_value),
			blockInstanceId: row.block_instance_id || undefined,
			tags: isPg ? savedRow!.tags : jsonParse(savedRow!.tags),
			description: savedRow!.description,
		}),

		savedToRow: (
			id: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			id,
			tags: isPg ? state.tags : JSON.stringify(state.tags),
			description: state.description,
			scope_level: scope.level,
			user_id: scope.level === "user" ? scope.userId : null,
		}),
	};
}

export const variableEntityConfigs: Record<
	SqlDialect,
	EntityConfig<any, any>
> = {
	sqlite: makeVariableEntityConfig("sqlite"),
	postgres: makeVariableEntityConfig("postgres"),
	duckdb: makeVariableEntityConfig("duckdb"),
	opfs: makeVariableEntityConfig("sqlite"),
};
