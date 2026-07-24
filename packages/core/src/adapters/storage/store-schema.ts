import {
	type CompiledQuery,
	type CreateIndexQuery,
	type CreateTableQuery,
	type DeleteQuery,
	type InsertQuery,
	QueryCompiler,
	type SelectQuery,
	type SqlDialect,
} from "../../translation/sql-compiler";

// ─── Helper ───────────────────────────────────────────────────────────────────

function compileAll(dialect: SqlDialect) {
	const qc = new QueryCompiler(dialect);
	return {
		pragma: qc.compilePragma("journal_mode", "WAL"),
		ddl: Object.fromEntries(
			Object.entries(TABLES).map(([name, q]) => [
				name,
				qc.compileCreateTable(q),
			]),
		) as Record<string, CompiledQuery>,
		ddlIndexes: Object.fromEntries(
			Object.entries(INDEXES).map(([name, q]) => [
				name,
				qc.compileCreateIndex(q),
			]),
		) as Record<string, CompiledQuery>,
		inserts: Object.fromEntries(
			Object.entries(INSERTS).map(([name, q]) => [name, qc.compileInsert(q)]),
		) as Record<string, CompiledQuery>,
		selects: Object.fromEntries(
			Object.entries(SELECTS).map(([name, q]) => [name, qc.compileSelect(q)]),
		) as Record<string, CompiledQuery>,
		deletes: Object.fromEntries(
			Object.entries(DELETES).map(([name, q]) => [name, qc.compileDelete(q)]),
		) as Record<string, CompiledQuery>,
		raw: RAW_SQL as Record<string, string>,
	};
}

// ─── Tables ───────────────────────────────────────────────────────────────────

const TABLES = {
	DDL_FILTERS: {
		table: "filters",
		ifNotExists: true,
		columns: [
			{ name: "filter_id", type: "text", primaryKey: true },
			{ name: "tool_name", type: "text", nullable: true },
			{ name: "table_name", type: "text", nullable: true },
			{ name: "parent_filter_id", type: "text", nullable: true },
			{
				name: "scope_level",
				type: "text",
				nullable: false,
				default: "session",
			},
			{ name: "session_id", type: "text", nullable: true },
			{ name: "user_id", type: "text", nullable: true },
			{ name: "combined_operation", type: "text", nullable: true },
			{ name: "combined_ids", type: "text", nullable: true },
			{ name: "schema_snapshot", type: "text", nullable: true },
			{
				name: "created_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_FILTER_RULES: {
		table: "filter_rules",
		ifNotExists: true,
		columns: [
			{
				name: "id",
				type: "int",
				primaryKey: true,
				autoIncrement: true,
			},
			{ name: "filter_id", type: "text", nullable: false },
			{ name: "property", type: "text", nullable: false },
			{ name: "operator", type: "text", nullable: false },
			{ name: "value", type: "text", nullable: false },
			{ name: "index_order", type: "int", nullable: false },
			{
				name: "filter_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES filters(filter_id) ON DELETE CASCADE",
			},
		],
		uniques: [["filter_id", "index_order"]],
	},
	DDL_SAVED_FILTERS: {
		table: "saved_filters",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "tags", type: "text", nullable: false },
			{ name: "description", type: "text", nullable: false },
			{ name: "scope_level", type: "text", nullable: false },
			{ name: "user_id", type: "text", nullable: true },
			{
				name: "saved_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_SESSION_ALIASES: {
		table: "session_aliases",
		ifNotExists: true,
		columns: [
			{ name: "session_id", type: "text", nullable: false },
			{ name: "alias_name", type: "text", nullable: false },
			{ name: "target_id", type: "text", nullable: false },
		],
		primaryKey: ["session_id", "alias_name"],
	},
	DDL_FORMS: {
		table: "forms",
		ifNotExists: true,
		columns: [
			{ name: "form_id", type: "text", primaryKey: true },
			{ name: "parent_form_id", type: "text", nullable: true },
			{ name: "schema_name", type: "text", nullable: false },
			{
				name: "scope_level",
				type: "text",
				nullable: false,
				default: "session",
			},
			{ name: "session_id", type: "text", nullable: true },
			{ name: "user_id", type: "text", nullable: true },
			{
				name: "created_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_FORM_ANSWERS: {
		table: "form_answers",
		ifNotExists: true,
		columns: [
			{ name: "form_id", type: "text", nullable: false },
			{ name: "question_id", type: "text", nullable: false },
			{ name: "value", type: "text", nullable: false },
			{
				name: "form_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES forms(form_id) ON DELETE CASCADE",
			},
		],
		primaryKey: ["form_id", "question_id"],
	},
	DDL_FORM_SKIPPED: {
		table: "form_skipped",
		ifNotExists: true,
		columns: [
			{ name: "form_id", type: "text", nullable: false },
			{ name: "question_id", type: "text", nullable: false },
			{
				name: "form_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES forms(form_id) ON DELETE CASCADE",
			},
		],
		primaryKey: ["form_id", "question_id"],
	},
	DDL_FORM_STALE: {
		table: "form_stale",
		ifNotExists: true,
		columns: [
			{ name: "form_id", type: "text", nullable: false },
			{ name: "question_id", type: "text", nullable: false },
			{
				name: "form_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES forms(form_id) ON DELETE CASCADE",
			},
		],
		primaryKey: ["form_id", "question_id"],
	},
	DDL_SAVED_FORMS: {
		table: "saved_forms",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "tags", type: "text", nullable: false },
			{ name: "description", type: "text", nullable: false },
			{ name: "scope_level", type: "text", nullable: false },
			{ name: "user_id", type: "text", nullable: true },
			{
				name: "saved_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_FORM_SESSION_ALIASES: {
		table: "form_session_aliases",
		ifNotExists: true,
		columns: [
			{ name: "session_id", type: "text", nullable: false },
			{ name: "alias_name", type: "text", nullable: false },
			{ name: "target_id", type: "text", nullable: false },
		],
		primaryKey: ["session_id", "alias_name"],
	},
	DDL_OBJECTS: {
		table: "objects",
		ifNotExists: true,
		columns: [
			{ name: "object_id", type: "text", primaryKey: true },
			{ name: "schema_name", type: "text", nullable: false },
			{ name: "parent_object_id", type: "text", nullable: true },
			{
				name: "scope_level",
				type: "text",
				nullable: false,
				default: "session",
			},
			{ name: "session_id", type: "text", nullable: true },
			{ name: "user_id", type: "text", nullable: true },
			{ name: "data", type: "text", nullable: false },
			{
				name: "created_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
			{ name: "schema_pinned_at", type: "text", nullable: true },
		],
	},
	DDL_SAVED_OBJECTS: {
		table: "saved_objects",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "tags", type: "text", nullable: false },
			{ name: "description", type: "text", nullable: false },
			{ name: "scope_level", type: "text", nullable: false },
			{ name: "user_id", type: "text", nullable: true },
			{
				name: "saved_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_OBJECT_SESSION_ALIASES: {
		table: "object_session_aliases",
		ifNotExists: true,
		columns: [
			{ name: "session_id", type: "text", nullable: false },
			{ name: "alias_name", type: "text", nullable: false },
			{ name: "target_id", type: "text", nullable: false },
		],
		primaryKey: ["session_id", "alias_name"],
	},
	DDL_EVENTS: {
		table: "events",
		ifNotExists: true,
		columns: [
			{ name: "commit_id", type: "text", primaryKey: true },
			{ name: "session_id", type: "text", nullable: true },
			{ name: "parent_commit_id", type: "text", nullable: true },
			{
				name: "scope_level",
				type: "text",
				nullable: false,
				default: "session",
			},
			{ name: "user_id", type: "text", nullable: true },
			{ name: "operation", type: "text", nullable: false },
			{ name: "mutations", type: "text", nullable: false },
			{
				name: "created_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
			{
				name: "linear_depth",
				type: "int",
				nullable: false,
				default: 0,
			},
			{
				name: "gc_lock",
				type: "int",
				nullable: false,
				default: 0,
			},
			{ name: "merge_source_commit_ids", type: "text", nullable: true },
			{ name: "merge_accepted_ids", type: "text", nullable: true },
			{ name: "merge_rejected_ids", type: "text", nullable: true },
			{ name: "schema_name", type: "text", nullable: false },
		],
	},
	DDL_SAVED_EVENTS: {
		table: "saved_events",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "tags", type: "text", nullable: false },
			{ name: "description", type: "text", nullable: false },
			{ name: "scope_level", type: "text", nullable: false },
			{ name: "user_id", type: "text", nullable: true },
			{
				name: "saved_at",
				type: "text",
				nullable: true,
				defaultRaw: "CURRENT_TIMESTAMP",
			},
		],
	},
	DDL_EVENT_SESSION_ALIASES: {
		table: "event_session_aliases",
		ifNotExists: true,
		columns: [
			{ name: "session_id", type: "text", nullable: false },
			{ name: "alias_name", type: "text", nullable: false },
			{ name: "target_id", type: "text", nullable: false },
		],
		primaryKey: ["session_id", "alias_name"],
	},
	DDL_DICT_NAMESPACES: {
		table: "dict_namespaces",
		ifNotExists: true,
		columns: [
			{ name: "code", type: "text", primaryKey: true },
			{ name: "description", type: "text", nullable: true },
			{ name: "is_public", type: "int", nullable: false },
			{ name: "is_external_private", type: "int", nullable: false },
			{ name: "is_mutable", type: "int", nullable: true },
		],
	},
	DDL_DICT_CONCEPTS: {
		table: "dict_concepts",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "namespace_code", type: "text", nullable: false },
			{ name: "standard_code", type: "text", nullable: false },
			{ name: "display", type: "text", nullable: false },
			{ name: "description", type: "text", nullable: true },
			{ name: "designation_date", type: "text", nullable: true },
			{ name: "active", type: "int", nullable: false },
			{
				name: "namespace_code_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES dict_namespaces(code)",
			},
		],
	},
	DDL_DICT_RELATIONS: {
		table: "dict_relations",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "concept_id", type: "text", nullable: false },
			{ name: "linked_id", type: "text", nullable: false },
			{ name: "relationship_type", type: "text", nullable: false },
			{ name: "active", type: "int", nullable: false },
			{ name: "designation_date", type: "text", nullable: true },
			{
				name: "concept_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES dict_concepts(id)",
			},
			{
				name: "linked_id_fk",
				type: "text",
				nullable: true,
				raw: "REFERENCES dict_concepts(id)",
			},
		],
	},
	DDL_DICT_RELATION_CACHE: {
		table: "dict_relation_cache",
		ifNotExists: true,
		columns: [
			{ name: "ancestor_concept_id", type: "text", nullable: false },
			{ name: "descendant_concept_id", type: "text", nullable: false },
			{ name: "link_depth", type: "int", nullable: false },
			{ name: "inferred_relationship_type", type: "text", nullable: false },
			{ name: "active", type: "int", nullable: false },
			{ name: "updated_at", type: "text", nullable: false },
		],
		primaryKey: [
			"ancestor_concept_id",
			"descendant_concept_id",
			"inferred_relationship_type",
		],
	},
	DDL_DICT_CUSTOM_EXPRESSIONS: {
		table: "dict_custom_expressions",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "text", primaryKey: true },
			{ name: "term", type: "text", nullable: false },
			{ name: "concept_id", type: "text", nullable: true },
			{ name: "scope_level", type: "text", nullable: false },
			{ name: "scope_id", type: "text", nullable: true },
			{ name: "data", type: "text", nullable: false },
		],
	},
} satisfies Record<string, CreateTableQuery>;

// ─── Indexes ──────────────────────────────────────────────────────────────────

const INDEXES = {
	IDX_FILTERS_SESSION: {
		table: "filters",
		name: "idx_filters_session",
		columns: ["session_id", "scope_level"],
	},
	IDX_FILTERS_SCOPE: {
		table: "filters",
		name: "idx_filters_scope",
		columns: ["scope_level", "user_id"],
	},
	IDX_CONCEPT_REL_FORWARD: {
		table: "dict_relations",
		name: "idx_concept_rel_forward",
		columns: ["concept_id", "active"],
	},
	IDX_CONCEPT_REL_REVERSE: {
		table: "dict_relations",
		name: "idx_concept_rel_reverse",
		columns: ["linked_id", "active"],
	},
	IDX_CONCEPT_CACHE_TRAVERSAL: {
		table: "dict_relation_cache",
		name: "idx_concept_cache_traversal",
		columns: ["ancestor_concept_id", "active"],
	},
};

// ─── Inserts ──────────────────────────────────────────────────────────────────

const INSERTS = {
	SQL_UPSERT_ALIAS: {
		table: "session_aliases",
		columns: ["session_id", "alias_name", "target_id"],
		onConflict: "replace",
		conflictColumns: ["session_id", "alias_name"],
	},
	SQL_UPSERT_FILTER: {
		table: "filters",
		columns: [
			"filter_id",
			"tool_name",
			"table_name",
			"parent_filter_id",
			"scope_level",
			"session_id",
			"user_id",
			"combined_operation",
			"combined_ids",
			"schema_snapshot",
		],
		onConflict: "replace",
		conflictColumns: ["filter_id"],
	},
	SQL_INSERT_FILTER_RULE: {
		table: "filter_rules",
		columns: ["filter_id", "property", "operator", "value", "index_order"],
	},
	SQL_UPSERT_SAVED_FILTER: {
		table: "saved_filters",
		columns: ["id", "tags", "description", "scope_level", "user_id"],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_FORM_SESSION: {
		table: "forms",
		columns: [
			"form_id",
			"parent_form_id",
			"schema_name",
			"scope_level",
			"session_id",
			"created_at",
		],
		columnLiterals: { scope_level: "'session'" },
		onConflict: "replace",
		conflictColumns: ["form_id"],
	},
	SQL_UPSERT_FORM_PERSISTENT: {
		table: "forms",
		columns: [
			"form_id",
			"parent_form_id",
			"schema_name",
			"scope_level",
			"user_id",
			"created_at",
		],
		onConflict: "replace",
		conflictColumns: ["form_id"],
	},
	SQL_INSERT_FORM_ANSWER: {
		table: "form_answers",
		columns: ["form_id", "question_id", "value"],
	},
	SQL_INSERT_FORM_SKIPPED: {
		table: "form_skipped",
		columns: ["form_id", "question_id"],
	},
	SQL_INSERT_FORM_STALE: {
		table: "form_stale",
		columns: ["form_id", "question_id"],
	},
	SQL_UPSERT_SAVED_FORM: {
		table: "saved_forms",
		columns: [
			"id",
			"tags",
			"description",
			"scope_level",
			"user_id",
			"saved_at",
		],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_OBJECT_ALIAS: {
		table: "object_session_aliases",
		columns: ["session_id", "alias_name", "target_id"],
		onConflict: "replace",
		conflictColumns: ["session_id", "alias_name"],
	},
	SQL_UPSERT_OBJECT_SESSION: {
		table: "objects",
		columns: [
			"object_id",
			"schema_name",
			"parent_object_id",
			"scope_level",
			"session_id",
			"data",
			"created_at",
			"schema_pinned_at",
		],
		columnLiterals: { scope_level: "'session'" },
		onConflict: "replace",
		conflictColumns: ["object_id"],
	},
	SQL_UPSERT_OBJECT_PERSISTENT: {
		table: "objects",
		columns: [
			"object_id",
			"schema_name",
			"parent_object_id",
			"scope_level",
			"user_id",
			"data",
			"created_at",
			"schema_pinned_at",
		],
		onConflict: "replace",
		conflictColumns: ["object_id"],
	},
	SQL_UPSERT_SAVED_OBJECT: {
		table: "saved_objects",
		columns: ["id", "tags", "description", "scope_level", "user_id"],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_EVENT_ALIAS: {
		table: "event_session_aliases",
		columns: ["session_id", "alias_name", "target_id"],
		onConflict: "replace",
		conflictColumns: ["session_id", "alias_name"],
	},
	SQL_UPSERT_EVENT_SESSION: {
		table: "events",
		columns: [
			"commit_id",
			"session_id",
			"parent_commit_id",
			"scope_level",
			"operation",
			"mutations",
			"created_at",
			"linear_depth",
			"gc_lock",
			"merge_source_commit_ids",
			"merge_accepted_ids",
			"merge_rejected_ids",
		],
		columnLiterals: { scope_level: "'session'" },
		onConflict: "replace",
		conflictColumns: ["commit_id"],
	},
	SQL_UPSERT_EVENT_PERSISTENT: {
		table: "events",
		columns: [
			"commit_id",
			"scope_level",
			"user_id",
			"parent_commit_id",
			"operation",
			"mutations",
			"created_at",
			"linear_depth",
			"gc_lock",
			"merge_source_commit_ids",
			"merge_accepted_ids",
			"merge_rejected_ids",
			"schema_name",
		],
		onConflict: "replace",
		conflictColumns: ["commit_id"],
	},
	SQL_UPSERT_SAVED_EVENT: {
		table: "saved_events",
		columns: ["id", "tags", "description", "scope_level", "user_id"],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_DICT_CONCEPT: {
		table: "dict_concepts",
		columns: [
			"id",
			"namespace_code",
			"standard_code",
			"display",
			"description",
			"designation_date",
			"active",
		],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_DICT_NAMESPACE: {
		table: "dict_namespaces",
		columns: [
			"code",
			"description",
			"is_public",
			"is_external_private",
			"is_mutable",
		],
		onConflict: "replace",
		conflictColumns: ["code"],
	},
	SQL_UPSERT_DICT_RELATION: {
		table: "dict_relations",
		columns: [
			"id",
			"concept_id",
			"linked_id",
			"relationship_type",
			"active",
			"designation_date",
		],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_DICT_RELATION_CACHE: {
		table: "dict_relation_cache",
		columns: [
			"ancestor_concept_id",
			"descendant_concept_id",
			"link_depth",
			"inferred_relationship_type",
			"active",
			"updated_at",
		],
		onConflict: "replace",
		conflictColumns: [
			"ancestor_concept_id",
			"descendant_concept_id",
			"inferred_relationship_type",
		],
	},
	SQL_UPSERT_DICT_EXPRESSION: {
		table: "dict_custom_expressions",
		columns: ["id", "term", "concept_id", "scope_level", "scope_id", "data"],
		onConflict: "replace",
		conflictColumns: ["id"],
	},
	SQL_UPSERT_FORM_ALIAS: {
		table: "form_session_aliases",
		columns: ["session_id", "alias_name", "target_id"],
		onConflict: "replace",
		conflictColumns: ["session_id", "alias_name"],
	},
};

// ─── Selects ──────────────────────────────────────────────────────────────────

const SELECTS: Record<string, SelectQuery> = {
	SQL_GET_ALIAS: {
		table: "session_aliases",
		select: [{ column: "target_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_LIST_ALIASES: {
		table: "session_aliases",
		select: [{ column: "alias_name" }, { column: "target_id" }],
		where: [{ column: "session_id", op: "eq" }],
	},
	SQL_SELECT_FILTER_SESSION: {
		table: "filters",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "filter_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_SELECT_FILTER_RULES: {
		table: "filter_rules",
		select: [
			{ column: "property" },
			{ column: "operator" },
			{ column: "value" },
		],
		where: [{ column: "filter_id", op: "eq" }],
		orderBy: [{ column: "index_order", direction: "ASC" }],
	},
	SQL_SELECT_SAVED_FILTER: {
		table: "saved_filters",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_SELECT_FILTER_PERSISTENT: {
		table: "filters",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "filter_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_LIST_FILTERS_SESSION: {
		table: "filters",
		select: [{ column: "filter_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_LIST_FILTERS_CHILDREN: {
		table: "filters",
		select: [{ column: "filter_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "parent_filter_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_EXPIRE_FILTERS_SESSION_FIND: {
		table: "filters",
		select: [{ column: "filter_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
			{ column: "created_at", op: "lt" },
		],
	},
	SQL_SELECT_SAVED_FILTERS_BY_SCOPE: {
		table: "saved_filters",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_SELECT_FORM_SESSION: {
		table: "forms",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "form_id", op: "eq" },
			{ column: "session_id", op: "eq" },
		],
	},
	SQL_SELECT_FORM_PERSISTENT: {
		table: "forms",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "form_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
		],
	},
	SQL_SELECT_SAVED_FORM: {
		table: "saved_forms",
		select: [{ column: "*", raw: "*" }],
		where: [{ column: "id", op: "eq" }],
	},
	SQL_SELECT_FORM_ANSWERS: {
		table: "form_answers",
		select: [{ column: "*", raw: "*" }],
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_SELECT_FORM_SKIPPED: {
		table: "form_skipped",
		select: [{ column: "*", raw: "*" }],
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_SELECT_FORM_STALE: {
		table: "form_stale",
		select: [{ column: "*", raw: "*" }],
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_LIST_FORMS_SESSION: {
		table: "forms",
		select: [{ column: "form_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_LIST_FORMS_CHILDREN: {
		table: "forms",
		select: [{ column: "form_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "parent_form_id", op: "eq" },
		],
	},
	SQL_GET_FORM_ALIAS: {
		table: "form_session_aliases",
		select: [{ column: "target_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_LIST_FORM_ALIASES: {
		table: "form_session_aliases",
		select: [{ column: "alias_name" }, { column: "target_id" }],
		where: [{ column: "session_id", op: "eq" }],
	},
	SQL_GET_OBJECT_ALIAS: {
		table: "object_session_aliases",
		select: [{ column: "target_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_LIST_OBJECT_ALIASES: {
		table: "object_session_aliases",
		select: [{ column: "alias_name" }, { column: "target_id" }],
		where: [{ column: "session_id", op: "eq" }],
	},
	SQL_SELECT_OBJECT_SESSION: {
		table: "objects",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "object_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_SELECT_SAVED_OBJECT: {
		table: "saved_objects",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_SELECT_OBJECT_PERSISTENT: {
		table: "objects",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "object_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_LIST_OBJECTS_SESSION: {
		table: "objects",
		select: [{ column: "object_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_LIST_OBJECTS_CHILDREN: {
		table: "objects",
		select: [{ column: "object_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "parent_object_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_SELECT_SAVED_OBJECTS_BY_SCOPE: {
		table: "saved_objects",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_GET_EVENT_ALIAS: {
		table: "event_session_aliases",
		select: [{ column: "target_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_LIST_EVENT_ALIASES: {
		table: "event_session_aliases",
		select: [{ column: "alias_name" }, { column: "target_id" }],
		where: [{ column: "session_id", op: "eq" }],
	},
	SQL_SELECT_EVENT_SESSION: {
		table: "events",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "commit_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_SELECT_SAVED_EVENT: {
		table: "saved_events",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_SELECT_EVENT_PERSISTENT: {
		table: "events",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "commit_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_LIST_EVENTS_SESSION: {
		table: "events",
		select: [{ column: "commit_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_LIST_EVENTS_CHILDREN: {
		table: "events",
		select: [{ column: "commit_id" }],
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "parent_commit_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_SELECT_SAVED_EVENTS_BY_SCOPE: {
		table: "saved_events",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "user_id", op: "eq" },
					{ column: "user_id", op: "is_null" },
				],
			},
		],
	},
	SQL_SELECT_DICT_CONCEPT_BY_ID: {
		table: "dict_concepts",
		select: [{ column: "*", raw: "*" }],
		where: [{ column: "id", op: "eq" }],
	},
	SQL_SELECT_DICT_NAMESPACES: {
		table: "dict_namespaces",
		select: [{ column: "*", raw: "*" }],
	},
	SQL_SELECT_DICT_RELATIONS_FORWARD: {
		table: "dict_relations",
		select: [
			{ column: "id" },
			{ column: "concept_id" },
			{ column: "linked_id" },
			{ column: "relationship_type" },
			{ column: "active" },
			{ column: "designation_date" },
		],
		where: [
			{ column: "concept_id", op: "eq" },
			{ column: "active", op: "eq", value: 1 },
		],
	},
	SQL_SELECT_DICT_RELATIONS_REVERSE: {
		table: "dict_relations",
		select: [
			{ column: "id" },
			{ column: "concept_id" },
			{ column: "linked_id" },
			{ column: "relationship_type" },
			{ column: "active" },
			{ column: "designation_date" },
		],
		where: [
			{ column: "linked_id", op: "eq" },
			{ column: "active", op: "eq", value: 1 },
		],
	},
	SQL_SELECT_DICT_CACHE_RELATED: {
		table: "dict_relation_cache",
		select: [{ column: "*", raw: "*" }],
		where: [
			{ column: "ancestor_concept_id", op: "eq" },
			{ column: "active", op: "eq", value: 1 },
			{ column: "link_depth", op: "leq" },
		],
	},
	SQL_SELECT_DICT_EXPRESSION_DATA: {
		table: "dict_custom_expressions",
		select: [{ column: "data" }],
		where: [{ column: "id", op: "eq" }],
	},
};

// ─── Deletes ──────────────────────────────────────────────────────────────────

const DELETES: Record<string, DeleteQuery> = {
	SQL_DELETE_ALIAS: {
		table: "session_aliases",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_DELETE_FILTER_RULES: {
		table: "filter_rules",
		where: [{ column: "filter_id", op: "eq" }],
	},
	SQL_DELETE_FILTER_SESSION: {
		table: "filters",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "filter_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_SAVED_FILTER: {
		table: "saved_filters",
		where: [{ column: "id", op: "eq" }],
	},
	SQL_DELETE_FILTER_PERSISTENT: {
		table: "filters",
		where: [
			{ column: "filter_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
		],
	},
	SQL_DELETE_FILTER_BY_ID: {
		table: "filters",
		where: [{ column: "filter_id", op: "eq" }],
	},
	SQL_DELETE_FILTER_RULES_BY_SESSION: {
		table: "filter_rules",
		where: [
			{
				column: "filter_id",
				op: "in_set",
				raw: "(SELECT filter_id FROM filters WHERE session_id = ?)",
			},
		],
	},
	SQL_DELETE_FILTERS_BY_SESSION: {
		table: "filters",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_FORM_ANSWERS: {
		table: "form_answers",
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_DELETE_FORM_SKIPPED: {
		table: "form_skipped",
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_DELETE_FORM_STALE: {
		table: "form_stale",
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_DELETE_FORM: {
		table: "forms",
		where: [{ column: "form_id", op: "eq" }],
	},
	SQL_DELETE_SAVED_FORM: {
		table: "saved_forms",
		where: [{ column: "id", op: "eq" }],
	},
	SQL_EXPIRE_FORMS_BY_SESSION_AGE: {
		table: "forms",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "created_at", op: "lt" },
		],
	},
	SQL_EXPIRE_FORMS_BY_SESSION: {
		table: "forms",
		where: [{ column: "session_id", op: "eq" }],
	},
	SQL_DELETE_FORM_ALIAS: {
		table: "form_session_aliases",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_DELETE_OBJECT_ALIAS: {
		table: "object_session_aliases",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_DELETE_OBJECT_SESSION: {
		table: "objects",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "object_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_SAVED_OBJECT: {
		table: "saved_objects",
		where: [{ column: "id", op: "eq" }],
	},
	SQL_DELETE_OBJECT_PERSISTENT: {
		table: "objects",
		where: [
			{ column: "object_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
		],
	},
	SQL_EXPIRE_OBJECTS_SESSION_AGE: {
		table: "objects",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
			{ column: "created_at", op: "lt" },
		],
	},
	SQL_EXPIRE_OBJECTS_SESSION: {
		table: "objects",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_EVENT_ALIAS: {
		table: "event_session_aliases",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "alias_name", op: "eq" },
		],
	},
	SQL_DELETE_EVENT_SESSION: {
		table: "events",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "commit_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_SAVED_EVENT: {
		table: "saved_events",
		where: [{ column: "id", op: "eq" }],
	},
	SQL_DELETE_EVENT_PERSISTENT: {
		table: "events",
		where: [
			{ column: "commit_id", op: "eq" },
			{ column: "scope_level", op: "eq" },
		],
	},
	SQL_EXPIRE_EVENTS_SESSION_AGE: {
		table: "events",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
			{ column: "created_at", op: "lt" },
		],
	},
	SQL_EXPIRE_EVENTS_SESSION: {
		table: "events",
		where: [
			{ column: "session_id", op: "eq" },
			{ column: "scope_level", op: "eq", raw: "'session'" },
		],
	},
	SQL_DELETE_DICT_RELATION_CACHE: {
		table: "dict_relation_cache",
	},
	SQL_DELETE_DICT_RELATION_CACHE_FOR: {
		table: "dict_relation_cache",
		where: [
			{
				OR: [
					{ column: "ancestor_concept_id", op: "eq" },
					{ column: "descendant_concept_id", op: "eq" },
				],
			},
		],
	},
	SQL_DELETE_DICT_EXPRESSION: {
		table: "dict_custom_expressions",
		where: [
			{ column: "id", op: "eq" },
			{ column: "scope_level", op: "eq" },
			{
				OR: [
					{ column: "scope_id", op: "eq" },
					{ column: "scope_id", op: "is_null" },
				],
			},
		],
	},
};

// ─── Raw SQL (complex queries that can't be expressed via AST) ────────────────

const RAW_SQL: Record<string, string> = {
	CTE_DICT_RELATED_CONCEPTS: `
      WITH RECURSIVE rel_graph(target_id, relationship_type, dir, depth) AS (
        -- Forward direct
        SELECT linked_id, relationship_type, 'forward', 1
        FROM dict_relations
        WHERE concept_id = ? AND active = 1 AND (? = 'forward' OR ? = 'both')

        UNION ALL

        -- Reverse direct with operator inversion
        SELECT concept_id, 
               CASE relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               'reverse', 1
        FROM dict_relations
        WHERE linked_id = ? AND active = 1 AND (? = 'reverse' OR ? = 'both')

        UNION ALL

        -- Recursive forward expansion
        SELECT r.linked_id, r.relationship_type, g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.concept_id
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'forward'

        UNION ALL

        -- Recursive reverse expansion
        SELECT r.concept_id, 
               CASE r.relationship_type 
                 WHEN 'NARROWER_THAN' THEN 'WIDER_THAN' 
                 WHEN 'WIDER_THAN' THEN 'NARROWER_THAN' 
                 ELSE 'EQUIVALENT' 
               END, 
               g.dir, g.depth + 1
        FROM rel_graph g
        JOIN dict_relations r ON g.target_id = r.linked_id
        WHERE r.active = 1 AND g.depth < ? AND g.dir = 'reverse'
      )
      SELECT DISTINCT g.target_id, g.relationship_type, g.dir, g.depth, c.* 
      FROM rel_graph g
      JOIN dict_concepts c ON g.target_id = c.id
      WHERE c.active = 1;
    `.trim(),
};

// ─── Pre-compiled SCHEMA ──────────────────────────────────────────────────────

export const SCHEMA = {
	sqlite: compileAll("sqlite"),
	postgres: compileAll("postgres"),
	duckdb: compileAll("duckdb"),
};

export type Dialect = keyof typeof SCHEMA;
