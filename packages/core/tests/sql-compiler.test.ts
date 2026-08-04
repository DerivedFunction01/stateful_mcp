import { describe, expect, test } from "bun:test";
import { QueryCompiler, type SelectQuery } from "../src/translation/sql-compiler";

const groupedEvents: SelectQuery = {
	table: "command_history_events",
	select: [
		{ column: "scope" },
		{ column: "scope_key" },
		{ column: "command_text" },
		{ column: "outcome", agg: "count", alias: "outcome_count" },
		{ column: "executed_at", agg: "min", alias: "first_executed_at" },
		{ column: "executed_at", agg: "max", alias: "last_executed_at" },
	],
	where: [{ column: "scope", op: "eq", value: "session" }],
	groupBy: ["scope", "scope_key", "command_text"],
};

describe("QueryCompiler INSERT SELECT", () => {
	test.each([
		["postgres", "$1"],
		["sqlite", "?"],
	] as const)("compiles grouped select inserts for %s", (dialect, placeholder) => {
		const query = new QueryCompiler(dialect).compileInsert({
			table: "command_history_rollups",
			columns: [
				"scope",
				"scope_key",
				"command_text",
				"outcome_count",
				"first_executed_at",
				"last_executed_at",
			],
			select: groupedEvents,
			onConflict: "ignore",
		});

		expect(query.sql).toContain(
			'"command_history_rollups" ("scope", "scope_key", "command_text", "outcome_count", "first_executed_at", "last_executed_at")',
		);
		expect(query.sql).toContain('SELECT "scope", "scope_key", "command_text"');
		expect(query.sql).toContain('COUNT("outcome") AS "outcome_count"');
		expect(query.sql).toContain(
			'GROUP BY "scope", "scope_key", "command_text"',
		);
		expect(query.sql).toContain(placeholder);
		expect(query.params).toEqual(["session"]);
	});

	test("rejects values and select together", () => {
		expect(() =>
			new QueryCompiler("sqlite").compileInsert({
				table: "commands",
				values: { command_text: ":wq" },
				columns: ["command_text"],
				select: groupedEvents,
			}),
		).toThrow("cannot use both 'values' and 'select'");
	});

	test("requires target columns for select inserts", () => {
		expect(() =>
			new QueryCompiler("sqlite").compileInsert({
				table: "commands",
				select: groupedEvents,
			}),
		).toThrow("requires at least one target column");
	});
});
