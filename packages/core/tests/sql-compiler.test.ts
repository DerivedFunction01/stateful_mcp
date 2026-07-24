import { describe, expect, test } from "bun:test";
import { QueryCompiler, SqlDialect } from "../src/translation/sql-compiler";

function qc(dialect: SqlDialect) {
	return new QueryCompiler(dialect);
}

describe("QueryCompiler - compileCreateTable", () => {
	const filtersDdl = {
		table: "filters",
		ifNotExists: true,
		columns: [
			{ name: "filter_id", type: "id" as const, primaryKey: true },
			{ name: "tool_name", type: "text" as const, nullable: true },
			{ name: "table_name", type: "text" as const, nullable: true },
			{ name: "parent_filter_id", type: "text" as const, nullable: true },
			{ name: "scope_level", type: "text" as const, nullable: false, default: "session" },
			{ name: "session_id", type: "text" as const, nullable: true },
			{ name: "user_id", type: "text" as const, nullable: true },
			{ name: "combined_operation", type: "text" as const, nullable: true },
			{ name: "combined_ids", type: "json" as const, nullable: true },
			{ name: "schema_snapshot", type: "json" as const, nullable: true },
			{ name: "created_at", type: "timestamp" as const, default: "now" },
		],
	};

	test("sqlite filters table", () => {
		const { sql } = qc("sqlite").compileCreateTable(filtersDdl);
		expect(sql).toContain("CREATE TABLE IF NOT EXISTS \"filters\"");
		expect(sql).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(sql).toContain('"combined_ids" TEXT NULL');
		expect(sql).toContain('"schema_snapshot" TEXT NULL');
		expect(sql).toContain('"created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
		expect(sql).toContain('"tool_name" TEXT NULL');
		expect(sql).toContain(`'session'`);
	});

	test("postgres filters table", () => {
		const { sql } = qc("postgres").compileCreateTable(filtersDdl);
		expect(sql).toContain("CREATE TABLE IF NOT EXISTS \"filters\"");
		expect(sql).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(sql).toContain('"combined_ids" JSONB NULL');
		expect(sql).toContain('"schema_snapshot" JSONB NULL');
		expect(sql).toContain('"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP');
	});

	test("duckdb filters table", () => {
		const { sql } = qc("duckdb").compileCreateTable(filtersDdl);
		expect(sql).toContain("CREATE TABLE IF NOT EXISTS \"filters\"");
		expect(sql).toContain('"filter_id" TEXT PRIMARY KEY');
		expect(sql).toContain('"combined_ids" TEXT NULL');
		expect(sql).toContain('"schema_snapshot" TEXT NULL');
		expect(sql).toContain('"created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
	});

	const filterRulesDdl = {
		table: "filter_rules",
		ifNotExists: true,
		columns: [
			{ name: "id", type: "int" as const, autoIncrement: true, primaryKey: true },
			{ name: "filter_id", type: "text" as const, nullable: false, raw: "REFERENCES \"filters\"(\"filter_id\") ON DELETE CASCADE" },
			{ name: "property", type: "text" as const, nullable: false },
			{ name: "operator", type: "text" as const, nullable: false },
			{ name: "value", type: "text" as const, nullable: false },
			{ name: "index_order", type: "int" as const, nullable: false },
		],
		uniques: [["filter_id", "index_order"]],
	};

	test("sqlite filter_rules with autoincrement", () => {
		const { sql } = qc("sqlite").compileCreateTable(filterRulesDdl);
		expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
		expect(sql).toContain("UNIQUE (\"filter_id\", \"index_order\")");
	});

	test("postgres filter_rules serial primary key", () => {
		const { sql } = qc("postgres").compileCreateTable(filterRulesDdl);
		expect(sql).toContain('"id" SERIAL PRIMARY KEY');
		expect(sql).toContain("UNIQUE (\"filter_id\", \"index_order\")");
	});

	test("duckdb filter_rules", () => {
		const { sql } = qc("duckdb").compileCreateTable(filterRulesDdl);
		expect(sql).toContain('"id" INTEGER PRIMARY KEY');
		expect(sql).toContain("UNIQUE (\"filter_id\", \"index_order\")");
	});
});

describe("QueryCompiler - compileCreateIndex", () => {
	test("sqlite index", () => {
		const { sql } = qc("sqlite").compileCreateIndex({
			table: "filters",
			name: "idx_filters_session",
			columns: ["session_id", "scope_level"],
		});
		expect(sql).toBe('CREATE INDEX IF NOT EXISTS "idx_filters_session" ON "filters" ("session_id", "scope_level");');
	});

	test("pg index with different name", () => {
		const { sql } = qc("postgres").compileCreateIndex({
			table: "filters",
			name: "idx_pg_filters_session",
			columns: ["session_id", "scope_level"],
		});
		expect(sql).toBe('CREATE INDEX IF NOT EXISTS "idx_pg_filters_session" ON "filters" ("session_id", "scope_level");');
	});

	test("index with WHERE clause (partial index)", () => {
		const { sql } = qc("postgres").compileCreateIndex({
			table: "filters",
			name: "idx_active_filters",
			columns: ["session_id"],
			where: "scope_level = 'session'",
		});
		expect(sql).toContain("WHERE scope_level = 'session'");
	});
});

describe("QueryCompiler - compileInsert", () => {
	test("simple insert", () => {
		const { sql, params } = qc("sqlite").compileInsert({
			table: "session_aliases",
			values: { session_id: "s1", alias_name: "a", target_id: "t1" },
		});
		expect(sql).toContain('INSERT INTO "session_aliases"');
		expect(sql).toContain('"session_id", "alias_name", "target_id"');
		expect(sql).toContain("(?, ?, ?)");
		expect(params).toEqual(["s1", "a", "t1"]);
	});

	test("postgres insert with $N placeholders", () => {
		const { sql, params } = qc("postgres").compileInsert({
			table: "session_aliases",
			values: { session_id: "s1", alias_name: "a", target_id: "t1" },
		});
		expect(sql).toContain("($1, $2, $3)");
		expect(params).toEqual(["s1", "a", "t1"]);
	});

	test("upsert with onConflict replace (sqlite)", () => {
		const { sql } = qc("sqlite").compileInsert({
			table: "filters",
			values: { filter_id: "f1", tool_name: "test" },
			onConflict: "replace",
			conflictColumns: ["filter_id"],
		});
		expect(sql).toContain("INSERT OR REPLACE INTO \"filters\"");
	});

	test("upsert with onConflict replace (postgres)", () => {
		const { sql } = qc("postgres").compileInsert({
			table: "filters",
			values: { filter_id: "f1", tool_name: "test" },
			onConflict: "replace",
			conflictColumns: ["filter_id"],
		});
		expect(sql).toContain('INSERT INTO "filters"');
		expect(sql).toContain("ON CONFLICT (\"filter_id\") DO UPDATE SET");
		expect(sql).toContain('"tool_name" = EXCLUDED."tool_name"');
	});

	test("upsert with onConflict replace (duckdb)", () => {
		const { sql } = qc("duckdb").compileInsert({
			table: "filters",
			values: { filter_id: "f1", tool_name: "test" },
			onConflict: "replace",
			conflictColumns: ["filter_id"],
		});
		// DuckDB uses ON CONFLICT pattern with excluded.* (lowercase)
		expect(sql).toContain('INSERT INTO "filters"');
		expect(sql).toContain("ON CONFLICT (\"filter_id\") DO UPDATE SET");
		expect(sql).toContain('"tool_name" = EXCLUDED."tool_name"');
	});

	test("onConflict ignore (postgres)", () => {
		const { sql } = qc("postgres").compileInsert({
			table: "filters",
			values: { filter_id: "f1" },
			onConflict: "ignore",
		});
		expect(sql).toContain("ON CONFLICT DO NOTHING");
	});

	test("onConflict ignore (sqlite)", () => {
		const { sql } = qc("sqlite").compileInsert({
			table: "filters",
			values: { filter_id: "f1" },
			onConflict: "ignore",
		});
		expect(sql).toContain("INSERT OR IGNORE INTO");
	});
});

describe("QueryCompiler - compileSelect", () => {
	const simpleSelect = {
		table: "objects",
		select: [{ column: "object_id" }, { column: "data" }],
		where: [{ column: "session_id", op: "eq" as const, value: "s1" }],
	};

	test("simple select sqlite", () => {
		const { sql, params } = qc("sqlite").compileSelect(simpleSelect);
		expect(sql).toContain('SELECT "object_id", "data"');
		expect(sql).toContain('FROM "objects"');
		expect(sql).toContain('WHERE ("session_id" = ?)');
		expect(params).toEqual(["s1"]);
	});

	test("simple select postgres", () => {
		const { sql, params } = qc("postgres").compileSelect(simpleSelect);
		expect(sql).toContain('WHERE ("session_id" = $1)');
		expect(params).toEqual(["s1"]);
	});

	test("select with json path (sqlite)", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "objects",
			select: [{ column: "data", jsonPath: "cellId", alias: "cid" }],
		});
		expect(sql).toContain("json_extract(\"data\", '$.cellId') AS \"cid\"");
	});

	test("select with json path (postgres)", () => {
		const { sql } = qc("postgres").compileSelect({
			table: "objects",
			select: [{ column: "data", jsonPath: "cellId", alias: "cid" }],
		});
		expect(sql).toContain("\"data\"::jsonb ->> 'cellId' AS \"cid\"");
	});

	test("select with json path (duckdb)", () => {
		const { sql } = qc("duckdb").compileSelect({
			table: "objects",
			select: [{ column: "data", jsonPath: "cellId", alias: "cid" }],
		});
		expect(sql).toContain("json_extract_string(\"data\", '$.cellId') AS \"cid\"");
	});

	test("select with nested json path (postgres)", () => {
		const { sql } = qc("postgres").compileSelect({
			table: "objects",
			select: [{ column: "data", jsonPath: "history.priorAcceptCount", alias: "acceptCount" }],
		});
		expect(sql).toContain("\"data\"::jsonb #>> '{history,priorAcceptCount}' AS \"acceptCount\"");
	});

	test("select with aggregation", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "filter_rules",
			select: [{ column: "filter_id" }, { column: "filter_id", agg: "count" as const, alias: "cnt" }],
			groupBy: ["filter_id"],
		});
		expect(sql).toContain('COUNT("filter_id") AS "cnt"');
		expect(sql).toContain('GROUP BY "filter_id"');
	});

	test("select with order by", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "objects",
			orderBy: [{ column: "created_at", direction: "DESC" as const, nulls: "LAST" as const }],
		});
		expect(sql).toContain('ORDER BY "created_at" DESC NULLS LAST');
	});

	test("select with limit and offset", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "objects",
			limit: 10,
			offset: 20,
		});
		expect(sql).toContain("LIMIT 10");
		expect(sql).toContain("OFFSET 20");
	});
});

describe("QueryCompiler - compileUpdate", () => {
	test("update with set", () => {
		const { sql, params } = qc("sqlite").compileUpdate({
			table: "session_aliases",
			set: { target_id: "new_target" },
			where: [{ column: "session_id", op: "eq" as const, value: "s1" }, { column: "alias_name", op: "eq" as const, value: "a" }],
		});
		expect(sql).toContain('UPDATE "session_aliases"');
		expect(sql).toContain('SET "target_id" = ?');
		expect(sql).toContain('WHERE ("session_id" = ? AND "alias_name" = ?)');
		expect(params).toEqual(["new_target", "s1", "a"]);
	});

	test("update with returning (postgres)", () => {
		const { sql } = qc("postgres").compileUpdate({
			table: "objects",
			set: { data: "new_data" },
			where: [{ column: "object_id", op: "eq" as const, value: "o1" }],
			returning: ["object_id", "data"],
		});
		expect(sql).toContain('RETURNING "object_id", "data"');
	});
});

describe("QueryCompiler - compileDelete", () => {
	test("delete with where", () => {
		const { sql, params } = qc("sqlite").compileDelete({
			table: "session_aliases",
			where: [{ column: "session_id", op: "eq" as const, value: "s1" }, { column: "alias_name", op: "eq" as const, value: "a" }],
		});
		expect(sql).toContain('DELETE FROM "session_aliases"');
		expect(sql).toContain('WHERE ("session_id" = ? AND "alias_name" = ?)');
		expect(params).toEqual(["s1", "a"]);
	});

	test("delete with returning (postgres)", () => {
		const { sql } = qc("postgres").compileDelete({
			table: "objects",
			where: [{ column: "object_id", op: "eq" as const, value: "o1" }],
			returning: ["object_id"],
		});
		expect(sql).toContain('RETURNING "object_id"');
	});
});

describe("QueryCompiler - wrapInTransaction", () => {
	test("wraps string query", () => {
		const wrapped = qc("sqlite").wrapInTransaction("CREATE TABLE t (a TEXT);\nCREATE TABLE t2 (b TEXT);");
		expect(wrapped).toContain("BEGIN;");
		expect(wrapped).toContain("COMMIT;");
		expect(wrapped).toContain("CREATE TABLE t (a TEXT)");
		expect(wrapped).toContain("CREATE TABLE t2 (b TEXT)");
	});
});

describe("QueryCompiler - compileInsert upsert edge cases", () => {
	test("upsert with all columns in conflict (no update columns)", () => {
		const { sql } = qc("postgres").compileInsert({
			table: "saved_filters",
			values: { id: "f1" },
			onConflict: "replace",
			conflictColumns: ["id"],
		});
		// No non-key columns to update, fallback to DO NOTHING
		expect(sql).toContain("ON CONFLICT (\"id\") DO NOTHING");
	});

	test("upsert columns-only (no values)", () => {
		const { sql } = qc("postgres").compileInsert({
			table: "filters",
			columns: ["filter_id", "tool_name", "table_name"],
			onConflict: "replace",
			conflictColumns: ["filter_id"],
		});
		expect(sql).toContain("ON CONFLICT (\"filter_id\") DO UPDATE SET");
		expect(sql).toContain('"tool_name" = EXCLUDED."tool_name"');
		expect(sql).toContain('"table_name" = EXCLUDED."table_name"');
	});
});

describe("QueryCompiler - compileSelect filters pattern", () => {
	test("select with multiple where conditions (AND implicit)", () => {
		const { sql, params } = qc("sqlite").compileSelect({
			table: "filters",
			select: [{ raw: "1" as any, alias: "exists" }],
			where: [
				{ column: "session_id", op: "eq" as const, value: "s1" },
				{ column: "filter_id", op: "eq" as const, value: "f1" },
				{ column: "scope_level", op: "eq" as const, value: "session" },
			],
		});
		expect(sql).toContain("WHERE (\"session_id\" = ? AND \"filter_id\" = ? AND \"scope_level\" = ?)");
		expect(params).toEqual(["s1", "f1", "session"]);
	});

	test("select with OR condition", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "filters",
			where: [{ OR: [
				{ column: "scope_level", op: "eq" as const, value: "session" },
				{ column: "scope_level", op: "eq" as const, value: "global" },
			]}],
		});
		expect(sql).toContain('WHERE (("scope_level" = ? OR "scope_level" = ?))');
	});

	test("select with raw column in projection", () => {
		const { sql } = qc("sqlite").compileSelect({
			table: "events",
			select: [{ column: "commit_id" }, { raw: "1" as any }],
		});
		expect(sql).toContain('SELECT "commit_id", 1');
	});
});

describe("QueryCompiler - column types across dialects", () => {
	test("uuid column type", () => {
		const { sql: sqlite } = qc("sqlite").compileCreateTable({
			table: "test",
			columns: [{ name: "id", type: "uuid" as const }],
		});
		const { sql: pg } = qc("postgres").compileCreateTable({
			table: "test",
			columns: [{ name: "id", type: "uuid" as const }],
		});
		const { sql: duck } = qc("duckdb").compileCreateTable({
			table: "test",
			columns: [{ name: "id", type: "uuid" as const }],
		});
		expect(sqlite).toContain('"id" TEXT');
		expect(pg).toContain('"id" UUID');
		expect(duck).toContain('"id" UUID');
	});

	test("bool column type", () => {
		const { sql: sqlite } = qc("sqlite").compileCreateTable({
			table: "test",
			columns: [{ name: "active", type: "bool" as const }],
		});
		const { sql: pg } = qc("postgres").compileCreateTable({
			table: "test",
			columns: [{ name: "active", type: "bool" as const }],
		});
		expect(sqlite).toContain('"active" INTEGER');
		expect(pg).toContain('"active" BOOLEAN');
	});

	test("blob column type", () => {
		const { sql: sqlite } = qc("sqlite").compileCreateTable({
			table: "test",
			columns: [{ name: "data", type: "blob" as const }],
		});
		const { sql: pg } = qc("postgres").compileCreateTable({
			table: "test",
			columns: [{ name: "data", type: "blob" as const }],
		});
		expect(sqlite).toContain('"data" BLOB');
		expect(pg).toContain('"data" BYTEA');
	});

	test("real column type", () => {
		const { sql: sqlite } = qc("sqlite").compileCreateTable({
			table: "test",
			columns: [{ name: "score", type: "real" as const }],
		});
		const { sql: pg } = qc("postgres").compileCreateTable({
			table: "test",
			columns: [{ name: "score", type: "real" as const }],
		});
		expect(sqlite).toContain('"score" REAL');
		expect(pg).toContain('"score" DOUBLE PRECISION');
	});
});
