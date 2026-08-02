import { describe, expect, test } from "bun:test";
import { SCHEMA } from "../src/adapters/storage/store-schema";

/**
 * Normalize SQL for comparison: collapse whitespace, trim.
 */
function normalize(sql: string): string {
	return sql.replace(/\s+/g, " ").trim();
}

/**
 * Strip leading whitespace from each line and normalize.
 */
function strip(sql: string): string {
	return normalize(sql.replace(/^\s+/gm, ""));
}

describe("SCHEMA.sqlite DDL matches sqlite-schema.ts", () => {
	test("fresh dictionary synchronization schema is available for every SQL dialect", () => {
		for (const dialect of ["sqlite", "postgres", "duckdb"] as const) {
			const schema = SCHEMA[dialect];
			expect(schema.ddl.DDL_DICT_CUSTOM_EXPRESSIONS!.sql).toContain(
				"lookup_term",
			);
			expect(schema.ddl.DDL_DICT_FILTERS!.sql).toContain("concept_filters");
			expect(schema.ddl.DDL_DICT_SYNC_STATE!.sql).toContain("dict_sync_state");
			expect(schema.ddl.DDL_DICT_TOMBSTONES!.sql).toContain("dict_tombstones");
			expect(schema.ddlIndexes.IDX_DICT_EXPRESSION_LOOKUP!.sql).toContain(
				"lookup_term",
			);
		}
	});
	test("DDL_FILTERS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FILTERS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "filters"');
		expect(compiled).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(compiled).toContain(
			"\"scope_level\" TEXT NOT NULL DEFAULT 'session'",
		);
		expect(compiled).toContain(
			'"created_at" TEXT NULL DEFAULT CURRENT_TIMESTAMP',
		);
	});

	test("DDL_FILTER_RULES", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FILTER_RULES!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "filter_rules"');
		expect(compiled).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
		expect(compiled).toContain(
			"REFERENCES filters(filter_id) ON DELETE CASCADE",
		);
		expect(compiled).toContain('UNIQUE ("filter_id", "index_order")');
	});

	test("DDL_SAVED_FILTERS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_SAVED_FILTERS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "saved_filters"');
		expect(compiled).toContain('"id" TEXT PRIMARY KEY');
	});

	test("DDL_SESSION_ALIASES", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_SESSION_ALIASES!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "session_aliases"');
		expect(compiled).toContain('PRIMARY KEY ("session_id", "alias_name")');
	});

	test("DDL_FORMS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FORMS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "forms"');
		expect(compiled).toContain('"form_id" TEXT PRIMARY KEY');
	});

	test("DDL_FORM_ANSWERS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FORM_ANSWERS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "form_answers"');
		expect(compiled).toContain('PRIMARY KEY ("form_id", "question_id")');
		expect(compiled).toContain("REFERENCES forms(form_id) ON DELETE CASCADE");
	});

	test("DDL_FORM_SKIPPED", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FORM_SKIPPED!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "form_skipped"');
		expect(compiled).toContain('PRIMARY KEY ("form_id", "question_id")');
	});

	test("DDL_FORM_STALE", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FORM_STALE!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "form_stale"');
		expect(compiled).toContain('PRIMARY KEY ("form_id", "question_id")');
	});

	test("DDL_SAVED_FORMS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_SAVED_FORMS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "saved_forms"');
	});

	test("DDL_FORM_SESSION_ALIASES", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_FORM_SESSION_ALIASES!.sql);
		expect(compiled).toContain(
			'CREATE TABLE IF NOT EXISTS "form_session_aliases"',
		);
		expect(compiled).toContain('PRIMARY KEY ("session_id", "alias_name")');
	});

	test("DDL_OBJECTS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_OBJECTS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "objects"');
		expect(compiled).toContain('"object_id" TEXT PRIMARY KEY');
		expect(compiled).toContain('"data" TEXT NOT NULL');
	});

	test("DDL_SAVED_OBJECTS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_SAVED_OBJECTS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "saved_objects"');
	});

	test("DDL_OBJECT_SESSION_ALIASES", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddl.DDL_OBJECT_SESSION_ALIASES!.sql,
		);
		expect(compiled).toContain(
			'CREATE TABLE IF NOT EXISTS "object_session_aliases"',
		);
		expect(compiled).toContain('PRIMARY KEY ("session_id", "alias_name")');
	});

	test("DDL_EVENTS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_EVENTS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "events"');
		expect(compiled).toContain('"commit_id" TEXT PRIMARY KEY');
		expect(compiled).toContain('"linear_depth" INTEGER NOT NULL DEFAULT 0');
		expect(compiled).toContain('"gc_lock" INTEGER NOT NULL DEFAULT 0');
	});

	test("DDL_SAVED_EVENTS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_SAVED_EVENTS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "saved_events"');
	});

	test("DDL_EVENT_SESSION_ALIASES", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddl.DDL_EVENT_SESSION_ALIASES!.sql,
		);
		expect(compiled).toContain(
			'CREATE TABLE IF NOT EXISTS "event_session_aliases"',
		);
		expect(compiled).toContain('PRIMARY KEY ("session_id", "alias_name")');
	});

	test("DDL_DICT_NAMESPACES", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_DICT_NAMESPACES!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "dict_namespaces"');
	});

	test("DDL_DICT_CONCEPTS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_DICT_CONCEPTS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "dict_concepts"');
		expect(compiled).toContain("REFERENCES dict_namespaces(code)");
	});

	test("DDL_DICT_RELATIONS", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_DICT_RELATIONS!.sql);
		expect(compiled).toContain('CREATE TABLE IF NOT EXISTS "dict_relations"');
		expect(compiled).toContain("REFERENCES dict_concepts(id)");
	});

	test("DDL_DICT_RELATION_CACHE", () => {
		const compiled = normalize(SCHEMA.sqlite.ddl.DDL_DICT_RELATION_CACHE!.sql);
		expect(compiled).toContain(
			'CREATE TABLE IF NOT EXISTS "dict_relation_cache"',
		);
		expect(compiled).toContain(
			'PRIMARY KEY ("ancestor_concept_id", "descendant_concept_id", "inferred_relationship_type")',
		);
	});

	test("DDL_DICT_CUSTOM_EXPRESSIONS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddl.DDL_DICT_CUSTOM_EXPRESSIONS!.sql,
		);
		expect(compiled).toContain(
			'CREATE TABLE IF NOT EXISTS "dict_custom_expressions"',
		);
	});
});

describe("SCHEMA.sqlite indexes match sqlite-schema.ts", () => {
	test("IDX_FILTERS_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddlIndexes.IDX_FILTERS_SESSION!.sql,
		);
		expect(compiled).toContain(
			'CREATE INDEX IF NOT EXISTS "idx_filters_session" ON "filters" ("session_id", "scope_level")',
		);
	});

	test("IDX_FILTERS_SCOPE", () => {
		const compiled = normalize(SCHEMA.sqlite.ddlIndexes.IDX_FILTERS_SCOPE!.sql);
		expect(compiled).toContain(
			'CREATE INDEX IF NOT EXISTS "idx_filters_scope" ON "filters" ("scope_level", "user_id")',
		);
	});

	test("IDX_CONCEPT_REL_FORWARD", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_REL_FORWARD!.sql,
		);
		expect(compiled).toContain(
			'CREATE INDEX IF NOT EXISTS "idx_concept_rel_forward" ON "dict_relations" ("concept_id", "active")',
		);
	});

	test("IDX_CONCEPT_REL_REVERSE", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_REL_REVERSE!.sql,
		);
		expect(compiled).toContain(
			'CREATE INDEX IF NOT EXISTS "idx_concept_rel_reverse" ON "dict_relations" ("linked_id", "active")',
		);
	});

	test("IDX_CONCEPT_CACHE_TRAVERSAL", () => {
		const compiled = normalize(
			SCHEMA.sqlite.ddlIndexes.IDX_CONCEPT_CACHE_TRAVERSAL!.sql,
		);
		expect(compiled).toContain(
			'CREATE INDEX IF NOT EXISTS "idx_concept_cache_traversal" ON "dict_relation_cache" ("ancestor_concept_id", "active")',
		);
	});
});

describe("SCHEMA.sqlite inserts match sqlite-schema.ts", () => {
	test("SQL_UPSERT_ALIAS", () => {
		const compiled = normalize(SCHEMA.sqlite.inserts.SQL_UPSERT_ALIAS!.sql);
		expect(compiled).toContain('INSERT OR REPLACE INTO "session_aliases"');
		expect(compiled).toContain('"session_id", "alias_name", "target_id"');
	});

	test("SQL_UPSERT_FILTER", () => {
		const compiled = normalize(SCHEMA.sqlite.inserts.SQL_UPSERT_FILTER!.sql);
		expect(compiled).toContain('INSERT OR REPLACE INTO "filters"');
		expect(compiled).toContain('"filter_id"');
	});

	test("SQL_INSERT_FILTER_RULE", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_INSERT_FILTER_RULE!.sql,
		);
		expect(compiled).toContain('INSERT INTO "filter_rules"');
	});

	test("SQL_UPSERT_SAVED_FILTER", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_FILTER!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "saved_filters"');
	});

	test("SQL_UPSERT_FORM_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_SESSION!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "forms"');
	});

	test("SQL_UPSERT_FORM_PERSISTENT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_PERSISTENT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "forms"');
	});

	test("SQL_INSERT_FORM_ANSWER", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_INSERT_FORM_ANSWER!.sql,
		);
		expect(compiled).toContain('INSERT INTO "form_answers"');
	});

	test("SQL_UPSERT_SAVED_FORM", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_FORM!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "saved_forms"');
	});

	test("SQL_UPSERT_OBJECT_ALIAS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_ALIAS!.sql,
		);
		expect(compiled).toContain(
			'INSERT OR REPLACE INTO "object_session_aliases"',
		);
	});

	test("SQL_UPSERT_OBJECT_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_SESSION!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "objects"');
	});

	test("SQL_UPSERT_OBJECT_PERSISTENT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_OBJECT_PERSISTENT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "objects"');
	});

	test("SQL_UPSERT_SAVED_OBJECT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_OBJECT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "saved_objects"');
	});

	test("SQL_UPSERT_EVENT_ALIAS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_ALIAS!.sql,
		);
		expect(compiled).toContain(
			'INSERT OR REPLACE INTO "event_session_aliases"',
		);
	});

	test("SQL_UPSERT_EVENT_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_SESSION!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "events"');
	});

	test("SQL_UPSERT_EVENT_PERSISTENT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_EVENT_PERSISTENT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "events"');
	});

	test("SQL_UPSERT_SAVED_EVENT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_SAVED_EVENT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "saved_events"');
	});

	test("SQL_UPSERT_DICT_CONCEPT", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_CONCEPT!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "dict_concepts"');
	});

	test("SQL_UPSERT_DICT_NAMESPACE", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_NAMESPACE!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "dict_namespaces"');
	});

	test("SQL_UPSERT_DICT_RELATION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_RELATION!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "dict_relations"');
	});

	test("SQL_UPSERT_DICT_RELATION_CACHE", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_RELATION_CACHE!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "dict_relation_cache"');
	});

	test("SQL_UPSERT_DICT_EXPRESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_DICT_EXPRESSION!.sql,
		);
		expect(compiled).toContain(
			'INSERT OR REPLACE INTO "dict_custom_expressions"',
		);
	});

	test("SQL_UPSERT_FORM_ALIAS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.inserts.SQL_UPSERT_FORM_ALIAS!.sql,
		);
		expect(compiled).toContain('INSERT OR REPLACE INTO "form_session_aliases"');
	});
});

describe("SCHEMA.sqlite selects match sqlite-schema.ts", () => {
	test("SQL_GET_ALIAS", () => {
		const compiled = normalize(SCHEMA.sqlite.selects.SQL_GET_ALIAS!.sql);
		expect(compiled).toContain(
			'SELECT "target_id" FROM "session_aliases" WHERE ("session_id" = ? AND "alias_name" = ?)',
		);
	});

	test("SQL_LIST_ALIASES", () => {
		const compiled = normalize(SCHEMA.sqlite.selects.SQL_LIST_ALIASES!.sql);
		expect(compiled).toContain(
			'SELECT "alias_name", "target_id" FROM "session_aliases" WHERE ("session_id" = ?)',
		);
	});

	test("SQL_SELECT_FILTER_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_SESSION!.sql,
		);
		expect(compiled).toContain('SELECT * FROM "filters"');
		expect(compiled).toContain("\"scope_level\" = 'session'");
	});

	test("SQL_SELECT_FILTER_RULES", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_FILTER_RULES!.sql,
		);
		expect(compiled).toContain(
			'SELECT "property", "operator", "value" FROM "filter_rules"',
		);
		expect(compiled).toContain('ORDER BY "index_order" ASC');
	});

	test("SQL_SELECT_FORM_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_FORM_SESSION!.sql,
		);
		expect(compiled).toContain('SELECT * FROM "forms"');
		expect(compiled).toContain('WHERE ("form_id" = ? AND "session_id" = ?)');
	});

	test("SQL_SELECT_FORM_ANSWERS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_FORM_ANSWERS!.sql,
		);
		expect(compiled).toContain('SELECT * FROM "form_answers"');
	});

	test("SQL_SELECT_DICT_CONCEPT_BY_ID", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_DICT_CONCEPT_BY_ID!.sql,
		);
		expect(compiled).toContain('SELECT * FROM "dict_concepts"');
		expect(compiled).toContain('WHERE ("id" = ?)');
	});

	test("SQL_SELECT_DICT_NAMESPACES", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_DICT_NAMESPACES!.sql,
		);
		expect(compiled).toContain('SELECT * FROM "dict_namespaces"');
	});

	test("SQL_SELECT_DICT_EXPRESSION_DATA", () => {
		const compiled = normalize(
			SCHEMA.sqlite.selects.SQL_SELECT_DICT_EXPRESSION_DATA!.sql,
		);
		expect(compiled).toContain('SELECT "data" FROM "dict_custom_expressions"');
	});
});

describe("SCHEMA.sqlite deletes match sqlite-schema.ts", () => {
	test("SQL_DELETE_ALIAS", () => {
		const compiled = normalize(SCHEMA.sqlite.deletes.SQL_DELETE_ALIAS!.sql);
		expect(compiled).toContain(
			'DELETE FROM "session_aliases" WHERE ("session_id" = ? AND "alias_name" = ?)',
		);
	});

	test("SQL_DELETE_FILTER_RULES", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_RULES!.sql,
		);
		expect(compiled).toContain(
			'DELETE FROM "filter_rules" WHERE ("filter_id" = ?)',
		);
	});

	test("SQL_DELETE_FILTER_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_FILTER_SESSION!.sql,
		);
		expect(compiled).toContain('DELETE FROM "filters"');
		expect(compiled).toContain("\"scope_level\" = 'session'");
	});

	test("SQL_DELETE_SAVED_FILTER", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_FILTER!.sql,
		);
		expect(compiled).toContain('DELETE FROM "saved_filters" WHERE ("id" = ?)');
	});

	test("SQL_DELETE_FORM_ANSWERS", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_FORM_ANSWERS!.sql,
		);
		expect(compiled).toContain(
			'DELETE FROM "form_answers" WHERE ("form_id" = ?)',
		);
	});

	test("SQL_DELETE_FORM", () => {
		const compiled = normalize(SCHEMA.sqlite.deletes.SQL_DELETE_FORM!.sql);
		expect(compiled).toContain('DELETE FROM "forms" WHERE ("form_id" = ?)');
	});

	test("SQL_DELETE_SAVED_FORM", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_SAVED_FORM!.sql,
		);
		expect(compiled).toContain('DELETE FROM "saved_forms" WHERE ("id" = ?)');
	});

	test("SQL_DELETE_OBJECT_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_OBJECT_SESSION!.sql,
		);
		expect(compiled).toContain('DELETE FROM "objects"');
		expect(compiled).toContain("\"scope_level\" = 'session'");
	});

	test("SQL_DELETE_EVENT_SESSION", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_EVENT_SESSION!.sql,
		);
		expect(compiled).toContain('DELETE FROM "events"');
		expect(compiled).toContain("\"scope_level\" = 'session'");
	});

	test("SQL_DELETE_DICT_RELATION_CACHE", () => {
		const compiled = normalize(
			SCHEMA.sqlite.deletes.SQL_DELETE_DICT_RELATION_CACHE!.sql,
		);
		expect(compiled).toContain('DELETE FROM "dict_relation_cache"');
	});
});

describe("SCHEMA compiled select AST (have to be updated to match what it actually outputs)", () => {
	test("CTE_DICT_RELATED_CONCEPTS is compiled from AST", () => {
		const compiled = SCHEMA.sqlite.conceptCtes.BOTH;
		expect(compiled).toBeTruthy();
		expect(compiled?.sql).toContain("WITH RECURSIVE");
		expect(compiled?.sql).toContain("SELECT DISTINCT");
		expect(compiled?.sql).toContain('"dict_concepts"');
	});
});

describe("SCHEMA multi-dialect", () => {
	test("all three dialects are present", () => {
		expect(SCHEMA.sqlite).toBeDefined();
		expect(SCHEMA.postgres).toBeDefined();
		expect(SCHEMA.duckdb).toBeDefined();
	});

	test("postgres uses ON CONFLICT DO UPDATE for replace", () => {
		const compiled = normalize(SCHEMA.postgres.inserts.SQL_UPSERT_ALIAS!.sql);
		expect(compiled).toContain('INSERT INTO "session_aliases"');
		expect(compiled).toContain(
			'ON CONFLICT ("session_id", "alias_name") DO UPDATE SET',
		);
	});

	test("duckdb uses ON CONFLICT DO UPDATE for replace", () => {
		const compiled = normalize(SCHEMA.duckdb.inserts.SQL_UPSERT_ALIAS!.sql);
		expect(compiled).toContain('INSERT INTO "session_aliases"');
		expect(compiled).toContain(
			'ON CONFLICT ("session_id", "alias_name") DO UPDATE SET',
		);
	});

	test("postgres uses TEXT for text type (same as sqlite-schema)", () => {
		const compiled = normalize(SCHEMA.postgres.ddl.DDL_SAVED_FILTERS!.sql);
		expect(compiled).toContain('"tags" TEXT NOT NULL');
	});

	test("postgres uses TIMESTAMP WITH TIME ZONE for text-based timestamps", () => {
		const compiled = normalize(SCHEMA.postgres.ddl.DDL_FILTERS!.sql);
		expect(compiled).toContain(
			'"created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP',
		);
	});

	test("postgres uses SERIAL for autoIncrement", () => {
		const compiled = normalize(SCHEMA.postgres.ddl.DDL_FILTER_RULES!.sql);
		expect(compiled).toContain('"id" SERIAL PRIMARY KEY');
	});

	test("duckdb uses TEXT for json type", () => {
		const compiled = normalize(SCHEMA.duckdb.ddl.DDL_SAVED_FILTERS!.sql);
		expect(compiled).toContain('"tags" TEXT NOT NULL');
	});

	test("postgres pragma is empty", () => {
		expect(SCHEMA.postgres.pragma).toBe("");
	});

	test("sqlite pragma is PRAGMA journal_mode = WAL;", () => {
		expect(SCHEMA.sqlite.pragma).toBe("PRAGMA journal_mode = WAL;");
	});
});
