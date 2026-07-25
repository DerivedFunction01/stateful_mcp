import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EntityConfig } from "./entity-config";

export const traceDdlKeys = {
	ddl: [
		"DDL_TRACES",
		"DDL_TRACE_STEPS",
		"DDL_SAVED_TRACES",
		"DDL_TRACE_SESSION_ALIASES",
	],
	ddlIndexes: ["IDX_TRACES_SESSION", "IDX_TRACES_SCOPE"],
};

function makeTraceStepChild(dialect: SqlDialect) {
	return {
		table: "trace_steps",
		parentIdColumn: "trace_id",
		orderColumn: "index_order",
		stateField: "steps" as const,
		toRow: (step: any, index: number, parentId: string) => ({
			trace_id: parentId,
			step_id: step.id,
			index_order: index,
			action: step.action,
			args: JSON.stringify(step.args || null),
			output_bindings: JSON.stringify(step.output_bindings || null),
			conditions: JSON.stringify(step.conditions || null),
			default_target: step.default_target || null,
			autonomous:
				step.autonomous !== undefined ? (step.autonomous ? 1 : 0) : null,
			execution_limits: JSON.stringify(step.execution_limits || null),
			transactional: JSON.stringify(step.transactional || null),
			success_criteria: JSON.stringify(step.success_criteria || null),
			error_targets: JSON.stringify(step.error_targets || null),
		}),
		fromRow: (row: Record<string, any>) => ({
			id: row.step_id,
			action: row.action,
			args: row.args ? JSON.parse(row.args) : undefined,
			output_bindings: row.output_bindings
				? JSON.parse(row.output_bindings)
				: undefined,
			conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
			default_target: row.default_target || undefined,
			autonomous:
				row.autonomous === 1 ? true : row.autonomous === 0 ? false : undefined,
			execution_limits: row.execution_limits
				? JSON.parse(row.execution_limits)
				: undefined,
			transactional: row.transactional
				? JSON.parse(row.transactional)
				: undefined,
			success_criteria: row.success_criteria
				? JSON.parse(row.success_criteria)
				: undefined,
			error_targets: row.error_targets
				? JSON.parse(row.error_targets)
				: undefined,
		}),
	};
}

function makeTraceEntityConfig(dialect: SqlDialect): EntityConfig<any, any> {
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
		idPrefix: "trc_",
		idField: "trace_id",
		sessionTable: "traces",
		savedTable: "saved_traces",
		aliasTable: "trace_session_aliases",

		sessionToRow: (id: string, sessionId: string, state: any) => ({
			trace_id: id,
			session_id: sessionId,
			scope_level: "session",
			goal: state.goal,
			version: state.version ?? null,
			environment_hash: state.environment_hash || null,
			confidence_score: state.confidence_score ?? null,
			usage_count: state.usage_count ?? 0,
			input_slots: jsonStringify(state.input_slots),
			capabilities: jsonStringify(state.capabilities),
			requires_approval_tools: jsonStringify(state.requires_approval_tools),
			start_step: state.start_step || null,
		}),

		rowToSession: (row: Record<string, any>) => ({
			trace_id: row.trace_id,
			goal: row.goal,
			version: row.version || undefined,
			environment_hash: row.environment_hash || undefined,
			confidence_score: row.confidence_score ?? undefined,
			usage_count: row.usage_count ?? 0,
			input_slots: jsonParse(row.input_slots) || undefined,
			capabilities: jsonParse(row.capabilities) || undefined,
			requires_approval_tools:
				jsonParse(row.requires_approval_tools) || undefined,
			start_step: row.start_step || undefined,
			steps: [] as any[],
		}),

		persistentToRow: (
			id: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			trace_id: id,
			scope_level: scope.level,
			session_id: null,
			user_id: scope.level === "user" ? scope.userId : null,
			goal: state.goal,
			version: state.version ?? null,
			environment_hash: state.environment_hash || null,
			confidence_score: state.confidence_score ?? null,
			usage_count: state.usage_count ?? 0,
			input_slots: jsonStringify(state.input_slots),
			capabilities: jsonStringify(state.capabilities),
			requires_approval_tools: jsonStringify(state.requires_approval_tools),
			start_step: state.start_step || null,
		}),

		rowToPersistent: (
			row: Record<string, any>,
			savedRow: Record<string, any> | null,
		) => ({
			trace_id: row.trace_id,
			goal: row.goal,
			version: row.version || undefined,
			environment_hash: row.environment_hash || undefined,
			confidence_score: row.confidence_score ?? undefined,
			usage_count: row.usage_count ?? 0,
			input_slots: jsonParse(row.input_slots) || undefined,
			capabilities: jsonParse(row.capabilities) || undefined,
			requires_approval_tools:
				jsonParse(row.requires_approval_tools) || undefined,
			start_step: row.start_step || undefined,
			steps: [] as any[],
			tags: isPg ? savedRow!.tags : jsonParse(savedRow!.tags),
			description: savedRow!.description,
			schema_pinned_at: savedRow!.schema_pinned_at || "",
		}),

		savedToRow: (
			id: string,
			scope: { level: string; userId?: string | null },
			state: any,
		) => ({
			id,
			tags: isPg ? state.tags : JSON.stringify(state.tags),
			description: state.description,
			schema_pinned_at: state.schema_pinned_at || "",
			scope_level: scope.level,
			user_id: scope.level === "user" ? scope.userId : null,
		}),

		children: [makeTraceStepChild(dialect)],
	};
}

export const traceEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
	sqlite: makeTraceEntityConfig("sqlite"),
	postgres: makeTraceEntityConfig("postgres"),
	duckdb: makeTraceEntityConfig("duckdb"),
	opfs: makeTraceEntityConfig("sqlite"),
};
