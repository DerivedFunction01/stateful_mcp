import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EntityConfig } from "./entity-config";

export const objectDdlKeys = {
	ddl: ["DDL_OBJECTS", "DDL_SAVED_OBJECTS", "DDL_OBJECT_SESSION_ALIASES"],
	ddlIndexes: ["IDX_OBJECTS_SESSION"],
};

function makeObjectEntityConfig(dialect: SqlDialect): EntityConfig<any, any> {
	const isPg = dialect === "postgres";
	const isDuck = dialect === "duckdb";

	const jsonParse = (v: any) => {
		if (v === null || v === undefined) return null;
		if (isDuck) return JSON.parse(String(v));
		return JSON.parse(v);
	};

	const jsonStringify = (v: any) => {
		if (v === null || v === undefined) return null;
		if (isPg) return v;
		return JSON.stringify(v);
	};

	return {
		idPrefix: "obj_",
		idField: "object_id",
		parentIdColumn: "parent_object_id",
		sessionTable: "objects",
		savedTable: "saved_objects",
		aliasTable: "object_session_aliases",

		sessionToRow: (id: string, sessionId: string, state: any) => ({
			object_id: id,
			schema_name: state.schemaName,
			parent_object_id: state.parentObjectId || null,
			scope_level: "session",
			session_id: sessionId,
			data: jsonStringify(state.data),
			created_at: state.createdAt,
			schema_pinned_at: state.schema_pinned_at || null,
		}),

		rowToSession: (row: Record<string, any>) => ({
			objectId: row.object_id,
			schemaName: row.schema_name,
			parentObjectId: row.parent_object_id,
			data: jsonParse(row.data),
			createdAt: row.created_at,
			schema_pinned_at: row.schema_pinned_at || undefined,
			linearDepth: row.linear_depth || undefined,
			gcLock: row.gc_lock === 1,
		}),

		persistentToRow: (
			id: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			object_id: id,
			schema_name: state.schemaName,
			parent_object_id: state.parentObjectId || null,
			scope_level: scope.level,
			user_id: scope.level === "user" ? scope.userId : null,
			data: jsonStringify(state.data),
			created_at: state.createdAt,
			schema_pinned_at: state.schema_pinned_at || "",
		}),

		rowToPersistent: (
			row: Record<string, any>,
			savedRow: Record<string, any> | null,
		) => ({
			objectId: row.object_id,
			schemaName: row.schema_name,
			parentObjectId: row.parent_object_id,
			data: jsonParse(row.data),
			createdAt: row.created_at,
			schema_pinned_at: row.schema_pinned_at || "",
			tags: isPg ? savedRow!.tags : jsonParse(savedRow!.tags),
			description: savedRow!.description,
			linearDepth: row.linear_depth || undefined,
			gcLock: row.gc_lock === 1,
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

export const objectEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
	sqlite: makeObjectEntityConfig("sqlite"),
	postgres: makeObjectEntityConfig("postgres"),
	duckdb: makeObjectEntityConfig("duckdb"),
};
