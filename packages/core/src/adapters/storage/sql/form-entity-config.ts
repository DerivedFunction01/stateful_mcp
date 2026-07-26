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

function makeFormAnswersChild(_dialect: SqlDialect) {
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
			value: JSON.stringify(child.value),
		}),
		fromRow: (row: Record<string, any>) => ({
			question_id: row.question_id,
			value: typeof row.value === "string" ? JSON.parse(row.value) : row.value,
		}),
		toState: (items: Array<{ question_id: string; value: any }>) => {
			const out: Record<string, any> = {};
			for (const item of items) {
				out[item.question_id] = item.value;
			}
			return out;
		},
		fromState: (state: any) => {
			const out: Array<{ question_id: string; value: any }> = [];
			for (const [question_id, value] of Object.entries(state ?? {})) {
				out.push({ question_id, value });
			}
			return out;
		},
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

function makeFormStaleChild(_dialect: SqlDialect) {
	return {
		table: "form_stale",
		parentIdColumn: "form_id",
		orderColumn: "question_id",
		stateField: "stale" as const,
		toRow: (child: string, _index: number, parentId: string) => ({
			form_id: parentId,
			question_id: child,
		}),
		fromRow: (_row: Record<string, any>) => _row.question_id,
		toState: (items: string[]) => {
			const out: Record<string, boolean> = {};
			for (const question_id of items) {
				out[question_id] = true;
			}
			return out;
		},
		fromState: (state: any) => {
			return Object.keys(state ?? {}).filter((k) => Boolean(state[k]));
		},
	};
}

function makeFormEntityConfig(_dialect: SqlDialect): EntityConfig<any, any> {
	const jsonParse = (v: any) => {
		if (v === null || v === undefined) return null;
		if (typeof v !== "string") return v;
		return JSON.parse(v);
	};

	const jsonStringify = (v: any) => {
		if (v === null || v === undefined) return null;
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
			tags: jsonParse(savedRow!.tags),
			description: savedRow!.description,
			schema_pinned_at: row.created_at,
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

		children: [
			makeFormAnswersChild(_dialect),
			makeFormSkippedChild(_dialect),
			makeFormStaleChild(_dialect),
		],
	};
}

export const formEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
	sqlite: makeFormEntityConfig("sqlite"),
	postgres: makeFormEntityConfig("postgres"),
	duckdb: makeFormEntityConfig("duckdb"),
	opfs: makeFormEntityConfig("sqlite"),
};
