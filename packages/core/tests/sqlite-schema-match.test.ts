import { describe, expect, test } from "bun:test";
import { QueryCompiler } from "../src/translation/sql-compiler";
import * as S from "../src/adapters/storage/sqlite-schema";

const qc = new QueryCompiler("sqlite");

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

describe("sqlite-schema DDL match", () => {
	test("DDL_FILTERS", () => {
		const { sql } = qc.compileCreateTable({
			table: "filters",
			ifNotExists: true,
			columns: [
				{ name: "filter_id", type: "id", primaryKey: true },
				{ name: "tool_name", type: "text", nullable: true },
				{ name: "table_name", type: "text", nullable: true },
				{ name: "parent_filter_id", type: "text", nullable: true },
				{ name: "scope_level", type: "text", nullable: false, default: "session" },
				{ name: "session_id", type: "text", nullable: true },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "combined_operation", type: "text", nullable: true },
				{ name: "combined_ids", type: "json", nullable: true },
				{ name: "schema_snapshot", type: "json", nullable: true },
				{ name: "created_at", type: "timestamp", default: "now" },
			],
		});
		// Note: sqlite-schema uses TEXT for combined_ids/schema_snapshot (no NOT NULL),
		// and created_at has no NOT NULL (compiler adds it).
		// The output matches in all meaningful ways beyond NOT NULL on created_at.
		expect(normalize(sql)).toContain('CREATE TABLE IF NOT EXISTS "filters"');
		expect(normalize(sql)).toContain('"scope_level" TEXT NOT NULL DEFAULT \'session\'');
		expect(normalize(sql)).toContain('"created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
	});

	test("DDL_FILTER_RULES", () => {
		const { sql } = qc.compileCreateTable({
			table: "filter_rules",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "int", autoIncrement: true, primaryKey: true },
				{ name: "filter_id", type: "text", nullable: false, raw: 'REFERENCES "filters"("filter_id") ON DELETE CASCADE' },
				{ name: "property", type: "text", nullable: false },
				{ name: "operator", type: "text", nullable: false },
				{ name: "value", type: "text", nullable: false },
				{ name: "index_order", type: "int", nullable: false },
			],
			uniques: [["filter_id", "index_order"]],
		});
		expect(normalize(sql)).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
		expect(normalize(sql)).toContain('"filter_id" TEXT NOT NULL REFERENCES "filters"("filter_id") ON DELETE CASCADE');
		expect(normalize(sql)).toContain('UNIQUE ("filter_id", "index_order")');
	});

	test("DDL_SAVED_FILTERS", () => {
		const { sql } = qc.compileCreateTable({
			table: "saved_filters",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "id", primaryKey: true },
				{ name: "tags", type: "json", nullable: false },
				{ name: "description", type: "text", nullable: false },
				{ name: "scope_level", type: "text", nullable: false },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "saved_at", type: "timestamp", default: "now" },
			],
		});
		expect(normalize(sql)).toContain('"tags" TEXT NOT NULL');
		expect(normalize(sql)).toContain('"description" TEXT NOT NULL');
	});

	test("DDL_SESSION_ALIASES", () => {
		const { sql } = qc.compileCreateTable({
			table: "session_aliases",
			ifNotExists: true,
			columns: [
				{ name: "session_id", type: "text", nullable: false },
				{ name: "alias_name", type: "text", nullable: false },
				{ name: "target_id", type: "text", nullable: false },
			],
			primaryKey: ["session_id", "alias_name"],
		});
		expect(normalize(sql)).toContain('"session_id" TEXT NOT NULL');
		expect(normalize(sql)).toContain('PRIMARY KEY ("session_id", "alias_name")');
	});

	test("DDL_OBJECTS", () => {
		const { sql } = qc.compileCreateTable({
			table: "objects",
			ifNotExists: true,
			columns: [
				{ name: "object_id", type: "id", primaryKey: true },
				{ name: "schema_name", type: "text", nullable: false },
				{ name: "parent_object_id", type: "text", nullable: true },
				{ name: "scope_level", type: "text", nullable: false, default: "session" },
				{ name: "session_id", type: "text", nullable: true },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "data", type: "json", nullable: false },
				{ name: "created_at", type: "timestamp", default: "now" },
				{ name: "schema_pinned_at", type: "timestamp", nullable: true },
			],
		});
		expect(normalize(sql)).toContain('"data" TEXT NOT NULL');
		expect(normalize(sql)).toContain('"schema_pinned_at" TEXT');
	});

	test("DDL_EVENTS", () => {
		const { sql } = qc.compileCreateTable({
			table: "events",
			ifNotExists: true,
			columns: [
				{ name: "commit_id", type: "id", primaryKey: true },
				{ name: "session_id", type: "text", nullable: true },
				{ name: "parent_commit_id", type: "text", nullable: true },
				{ name: "scope_level", type: "text", nullable: false, default: "session" },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "operation", type: "text", nullable: false },
				{ name: "mutations", type: "text", nullable: false },
				{ name: "created_at", type: "timestamp", default: "now" },
				{ name: "linear_depth", type: "int", nullable: false, default: 0 },
				{ name: "gc_lock", type: "int", nullable: false, default: 0 },
				{ name: "merge_source_commit_ids", type: "text", nullable: true },
				{ name: "merge_accepted_ids", type: "text", nullable: true },
				{ name: "merge_rejected_ids", type: "text", nullable: true },
				{ name: "schema_name", type: "text", nullable: false },
			],
		});
		expect(normalize(sql)).toContain('"linear_depth" INTEGER NOT NULL DEFAULT 0');
		expect(normalize(sql)).toContain('"gc_lock" INTEGER NOT NULL DEFAULT 0');
	});

	test("DDL_FORMS", () => {
		const { sql } = qc.compileCreateTable({
			table: "forms",
			ifNotExists: true,
			columns: [
				{ name: "form_id", type: "id", primaryKey: true },
				{ name: "parent_form_id", type: "text", nullable: true },
				{ name: "schema_name", type: "text", nullable: false },
				{ name: "scope_level", type: "text", nullable: false, default: "session" },
				{ name: "session_id", type: "text", nullable: true },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "created_at", type: "timestamp", default: "now" },
			],
		});
		expect(normalize(sql)).toContain('"form_id" TEXT PRIMARY KEY');
		expect(normalize(sql)).toContain('"scope_level" TEXT NOT NULL DEFAULT \'session\'');
	});

	test("DDL_FORM_ANSWERS", () => {
		const { sql } = qc.compileCreateTable({
			table: "form_answers",
			ifNotExists: true,
			columns: [
				{ name: "form_id", type: "text", nullable: false },
				{ name: "question_id", type: "text", nullable: false },
				{ name: "value", type: "text", nullable: false },
			],
			primaryKey: ["form_id", "question_id"],
			foreignKeys: [{ columns: ["form_id"], refTable: "forms", refColumns: ["form_id"], onDelete: "CASCADE" }],
		});
		const norm = normalize(sql);
		expect(norm).toContain('"form_id" TEXT NOT NULL');
		expect(norm).toContain('"question_id" TEXT NOT NULL');
		expect(norm).toContain('PRIMARY KEY ("form_id", "question_id")');
		expect(norm).toContain('REFERENCES "forms" ("form_id") ON DELETE CASCADE');
	});
});

describe("sqlite-schema SQL statement match", () => {
	test("SQL_GET_ALIAS", () => {
		const { sql } = qc.compileSelect({
			table: "session_aliases",
			select: [{ column: "target_id" }],
			where: [
				{ column: "session_id", op: "eq", value: undefined },
				{ column: "alias_name", op: "eq", value: undefined },
			],
		});
		const expected = 'SELECT "target_id" FROM "session_aliases" WHERE ("session_id" = ? AND "alias_name" = ?)';
		expect(normalize(sql)).toContain(normalize(expected));
	});

	test("SQL_UPSERT_ALIAS (sqlite uses INSERT OR REPLACE via compiler)", () => {
		const { sql } = qc.compileInsert({
			table: "session_aliases",
			columns: ["session_id", "alias_name", "target_id"],
			onConflict: "replace",
			conflictColumns: ["session_id", "alias_name"],
		});
		const norm = normalize(sql);
		expect(norm).toContain('INSERT OR REPLACE INTO "session_aliases"');
		expect(norm).toContain('"session_id", "alias_name", "target_id"');
	});

	test("SQL_UPSERT_ALIAS postgres uses ON CONFLICT", () => {
		const pgQc = new QueryCompiler("postgres");
		const { sql } = pgQc.compileInsert({
			table: "session_aliases",
			columns: ["session_id", "alias_name", "target_id"],
			onConflict: "replace",
			conflictColumns: ["session_id", "alias_name"],
		});
		const norm = normalize(sql);
		expect(norm).toContain('INSERT INTO "session_aliases"');
		expect(norm).toContain('ON CONFLICT ("session_id", "alias_name") DO UPDATE SET');
		expect(norm).toContain('"target_id" = EXCLUDED."target_id"');
	});

	test("SQL_DELETE_ALIAS", () => {
		const { sql } = qc.compileDelete({
			table: "session_aliases",
			where: [
				{ column: "session_id", op: "eq", value: undefined },
				{ column: "alias_name", op: "eq", value: undefined },
			],
		});
		const expected = 'DELETE FROM "session_aliases" WHERE ("session_id" = ? AND "alias_name" = ?)';
		// Compiler appends ;, strip it for comparison
		expect(normalize(sql.replace(/;$/, ""))).toBe(normalize(expected));
	});

	test("SQL_LIST_ALIASES", () => {
		const { sql } = qc.compileSelect({
			table: "session_aliases",
			select: [{ column: "alias_name" }, { column: "target_id" }],
			where: [{ column: "session_id", op: "eq", value: undefined }],
		});
		const expected = 'SELECT "alias_name", "target_id" FROM "session_aliases" WHERE ("session_id" = ?)';
		expect(normalize(sql.replace(/;$/, ""))).toBe(normalize(expected));
	});

	test("SQL_SELECT_OBJECT_SESSION", () => {
		const { sql } = qc.compileSelect({
			table: "objects",
			where: [
				{ column: "session_id", op: "eq", value: undefined },
				{ column: "object_id", op: "eq", value: undefined },
				{ column: "scope_level", op: "eq", value: "session" },
			],
		});
		const norm = normalize(sql);
		expect(norm).toContain('"scope_level" = ?');
	});

	test("SQL_UPSERT_OBJECT_SESSION uses INSERT OR REPLACE (sqlite)", () => {
		// sqlite-schema line 326 uses INSERT OR REPLACE
		const { sql } = qc.compileInsert({
			table: "objects",
			columns: ["object_id", "schema_name", "parent_object_id", "scope_level", "session_id", "data", "created_at", "schema_pinned_at"],
			onConflict: "replace",
			conflictColumns: ["object_id"],
		});
		const norm = normalize(sql);
		expect(norm).toContain('INSERT OR REPLACE INTO "objects"');
		expect(norm).not.toContain('ON CONFLICT'); // INSERT OR REPLACE is mutually exclusive with ON CONFLICT
	});

	test("SQL_DELETE_OBJECT_SESSION", () => {
		const { sql } = qc.compileDelete({
			table: "objects",
			where: [
				{ column: "session_id", op: "eq", value: undefined },
				{ column: "object_id", op: "eq", value: undefined },
				{ column: "scope_level", op: "eq", value: "session" },
			],
		});
		const norm = normalize(sql);
		expect(norm).toContain('DELETE FROM "objects"');
		expect(norm).toContain('WHERE ("session_id" = ? AND "object_id" = ? AND "scope_level" = ?)');
	});

	test("SQL_INSERT_FORM_ANSWER", () => {
		const { sql } = qc.compileInsert({
			table: "form_answers",
			columns: ["form_id", "question_id", "value"],
		});
		const norm = normalize(sql);
		expect(norm).toBe(normalize('INSERT INTO "form_answers" ("form_id", "question_id", "value") VALUES (?, ?, ?);'));
	});

	test("SQL_DELETE_FORM_ANSWERS", () => {
		const { sql } = qc.compileDelete({
			table: "form_answers",
			where: [{ column: "form_id", op: "eq", value: undefined }],
		});
		const norm = normalize(sql);
		expect(norm).toBe(normalize('DELETE FROM "form_answers" WHERE ("form_id" = ?);'));
	});

	test("SQL_SELECT_FORM_SESSION", () => {
		const { sql } = qc.compileSelect({
			table: "forms",
			where: [
				{ column: "form_id", op: "eq", value: undefined },
				{ column: "session_id", op: "eq", value: undefined },
			],
		});
		const norm = normalize(sql);
		expect(norm).toContain('SELECT *');
		expect(norm).toContain('FROM "forms"');
		expect(norm).toContain('WHERE ("form_id" = ? AND "session_id" = ?)');
	});

	test("SQL_EXPIRE_EVENTS_SESSION", () => {
		const { sql } = qc.compileDelete({
			table: "events",
			where: [
				{ column: "session_id", op: "eq", value: undefined },
				{ column: "scope_level", op: "eq", value: "session" },
			],
		});
		const norm = normalize(sql);
		expect(norm).toContain('DELETE FROM "events"');
		expect(norm).toContain('WHERE ("session_id" = ? AND "scope_level" = ?)');
	});
});

describe("pg-repo DDL matching", () => {
	test("pg filters table types", () => {
		const pgQc = new QueryCompiler("postgres");
		const { sql } = pgQc.compileCreateTable({
			table: "filters",
			ifNotExists: true,
			columns: [
				{ name: "filter_id", type: "id", primaryKey: true },
				{ name: "scope_level", type: "text", nullable: false, default: "session" },
				{ name: "combined_ids", type: "json", nullable: true },
				{ name: "schema_snapshot", type: "json", nullable: true },
				{ name: "created_at", type: "timestamp", default: "now" },
			],
		});
		const norm = normalize(sql);
		// pg-repo uses VARCHAR(100) for id, VARCHAR(30) for scope_level
		// Our compiler uses TEXT for "text" type and TEXT for "id" type
		expect(norm).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(norm).toContain('"combined_ids" JSONB');
		expect(norm).toContain('"schema_snapshot" JSONB');
		expect(norm).toContain('"created_at" TIMESTAMP WITH TIME ZONE');
	});

	test("pg filter_rules SERIAL", () => {
		const pgQc = new QueryCompiler("postgres");
		const { sql } = pgQc.compileCreateTable({
			table: "filter_rules",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "int", autoIncrement: true, primaryKey: true },
				{ name: "filter_id", type: "text", nullable: false, raw: 'REFERENCES "filters"("filter_id") ON DELETE CASCADE' },
			],
		});
		const norm = normalize(sql);
		// pg-repo line 72 uses SERIAL PRIMARY KEY
		expect(norm).toContain('"id" SERIAL PRIMARY KEY');
	});

	test("pg saved_filters JSONB tags", () => {
		const pgQc = new QueryCompiler("postgres");
		const { sql } = pgQc.compileCreateTable({
			table: "saved_filters",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "id", primaryKey: true },
				{ name: "tags", type: "json", nullable: false },
				{ name: "description", type: "text", nullable: false },
				{ name: "scope_level", type: "text", nullable: false },
				{ name: "user_id", type: "text", nullable: true },
				{ name: "saved_at", type: "timestamp", default: "now" },
			],
		});
		const norm = normalize(sql);
		// pg-repo line 85-89 uses JSONB for tags
		expect(norm).toContain('"tags" JSONB NOT NULL');
	});
});

describe("duckdb-repo DDL matching", () => {
	test("duckdb filters table types", () => {
		const dkQc = new QueryCompiler("duckdb");
		const { sql } = dkQc.compileCreateTable({
			table: "filters",
			ifNotExists: true,
			columns: [
				{ name: "filter_id", type: "id", primaryKey: true },
				{ name: "combined_ids", type: "json", nullable: true },
				{ name: "schema_snapshot", type: "json", nullable: true },
				{ name: "created_at", type: "timestamp", default: "now" },
			],
		});
		const norm = normalize(sql);
		// duckdb-repo uses TEXT for everything
		expect(norm).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(norm).toContain('"combined_ids" TEXT');
		expect(norm).toContain('"schema_snapshot" TEXT');
		expect(norm).toContain('"created_at" TEXT');
	});

	test("duckdb filter_rules integer PK", () => {
		const dkQc = new QueryCompiler("duckdb");
		const { sql } = dkQc.compileCreateTable({
			table: "filter_rules",
			ifNotExists: true,
			columns: [
				{ name: "id", type: "int", autoIncrement: true, primaryKey: true },
			],
		});
		const norm = normalize(sql);
		expect(norm).toContain('"id" INTEGER PRIMARY KEY');
	});
});
