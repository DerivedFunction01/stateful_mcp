import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EntityConfig } from "./entity-config";

export const formDdlKeys = {
	ddl: [
		"DDL_FORMS",
		"DDL_FORM_ANSWERS",
		"DDL_FORM_SKIPPED",
		"DDL_FORM_STALE",
		"DDL_SAVED_FORMS",
		"DDL_FORM_SESSION_ALIASES",
	],
	ddlIndexes: ["IDX_FORMS_SESSION"],
};

function makeFormAnswersChild(dialect: SqlDialect) {
	return {
		table: "form_answers",
		parentIdColumn: "form_id",
		orderColumn: "question_id",
		stateField: "answers" as const,
		toRow: (
			child: { question_id: string; value: any },
			_index: number,
			parentId: string,
		) => ({
			form_id: parentId,
			question_id: child.question_id,
			value: dialect === "postgres" ? child.value : JSON.stringify(child.value),
		}),
		fromRow: (row: Record<string, any>) => ({
			question_id: row.question_id,
			value: dialect === "postgres" ? row.value : JSON.parse(row.value),
		}),
	};
}

function makeFormSkippedChild(_dialect: SqlDialect) {
	return {
		table: "form_skipped",
		parentIdColumn: "form_id",
		orderColumn: "question_id",
		stateField: "skipped" as const,
		toRow: (child: string, _index: number, parentId: string) => ({
			form_id: parentId,
			question_id: child,
		}),
		fromRow: (row: Record<string, any>) => row.question_id,
	};
}

function makeFormStaleChild(dialect: SqlDialect) {
	return {
		table: "form_stale",
		parentIdColumn: "form_id",
		orderColumn: "question_id",
		stateField: "stale" as const,
		toRow: (
			child: { question_id: string; value: boolean },
			_index: number,
			parentId: string,
		) => ({
			form_id: parentId,
			question_id: child.question_id,
			value: child.value ? 1 : 0,
		}),
		fromRow: (row: Record<string, any>) => ({
			question_id: row.question_id,
			value: row.value === 1,
		}),
	};
}

function makeFormEntityConfig(dialect: SqlDialect): EntityConfig<any, any> {
	const isPg = dialect === "postgres";

	const jsonParse = (v: any) => {
		if (v === null || v === undefined) return null;
		if (isPg) return v;
		return JSON.parse(v);
	};

	const jsonStringify = (v: any) => {
		if (v === null || v === undefined) return null;
		if (isPg) return v;
		return JSON.stringify(v);
	};

	return {
		idPrefix: "form_",
		idField: "form_id",
		parentIdColumn: "parent_form_id",
		sessionTable: "forms",
		savedTable: "saved_forms",
		aliasTable: "form_session_aliases",

		sessionToRow: (id: string, sessionId: string, state: any) => ({
			form_id: id,
			parent_form_id: state.parentFormId || null,
			schema_name: state.schemaName,
			scope_level: "session",
			session_id: sessionId,
			created_at: state.timestamp,
		}),

		rowToSession: (row: Record<string, any>) => ({
			formId: row.form_id,
			parentFormId: row.parent_form_id,
			schemaName: row.schema_name,
			answers: {} as Record<string, any>,
			skipped: [] as string[],
			stale: {} as Record<string, boolean>,
			timestamp: row.created_at,
		}),

		persistentToRow: (
			id: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			form_id: id,
			parent_form_id: state.parentFormId || null,
			schema_name: state.schemaName,
			scope_level: scope.level,
			user_id: scope.level === "user" ? scope.userId : null,
			created_at: state.timestamp,
		}),

		rowToPersistent: (
			row: Record<string, any>,
			savedRow: Record<string, any> | null,
		) => ({
			formId: row.form_id,
			parentFormId: row.parent_form_id,
			schemaName: row.schema_name,
			answers: {} as Record<string, any>,
			skipped: [] as string[],
			stale: {} as Record<string, boolean>,
			timestamp: row.created_at,
			tags: isPg ? savedRow!.tags : JSON.parse(savedRow!.tags),
			description: savedRow!.description,
			schema_pinned_at: row.created_at,
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

		children: [
			makeFormAnswersChild(dialect),
			makeFormSkippedChild(dialect),
			makeFormStaleChild(dialect),
		],
	};
}

export const formEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
	sqlite: makeFormEntityConfig("sqlite"),
	postgres: makeFormEntityConfig("postgres"),
	duckdb: makeFormEntityConfig("duckdb"),
};
