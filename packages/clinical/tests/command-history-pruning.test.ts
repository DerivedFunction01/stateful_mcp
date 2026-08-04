import { describe, expect, it } from "bun:test";
import { SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import { SqlCommandHistoryStore } from "../src/learning/sql-command-history-store";
import { CommandHistoryQueryCompiler } from "../src/stores/sql/command-history-query-compiler";

describe("command history pruning & aggregates", () => {
	it("compiles sqlite onConflict AST correctly and runs consolidation when limit is exceeded", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const executor = new SqlExecutor(backend);
		const store = new SqlCommandHistoryStore("sqlite", executor, {
			maxHistoryRows: 4,
			pruneBatchSize: 2,
		});

		// 1. Record 2 successes (no pruning triggered yet)
		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":wq",
			executedAt: "2026-08-04T12:00:00.000Z",
			canonicalVerb: "wq",
			commandId: "wq",
			args: [{ index: 0, value: "file.txt" }],
		});
		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":q",
			executedAt: "2026-08-04T13:00:00.000Z",
			canonicalVerb: "q",
			commandId: "q",
		});

		let rawEvents = await executor.query(
			"SELECT COUNT(*) as count FROM command_history_events",
			[],
		);
		expect(Number(rawEvents[0].count)).toBe(4);

		// 2. Record 3rd success -> triggers pruning of oldest row (:wq)
		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":write",
			executedAt: "2026-08-04T14:00:00.000Z",
			canonicalVerb: "write",
			commandId: "write",
		});

		// Check raw tables: count should be 4 because 1 command (2 rows) was consolidated
		rawEvents = await executor.query(
			"SELECT COUNT(*) as count FROM command_history_events",
			[],
		);
		expect(Number(rawEvents[0].count)).toBe(4);

		// Check aggregate table: :wq should have been moved there
		const aggregates = await executor.query(
			"SELECT command_text, success_count FROM command_history_aggregates",
			[],
		);
		expect(aggregates).toHaveLength(2); // :wq is added for both "session" and "all" scopes (so 2 rows)
		const sessionAgg = aggregates.find((a: any) => a.command_text === ":wq");
		expect(sessionAgg?.success_count).toBe(1);

		// 3. Query command history: should return blended results (all 3 commands should be present)
		const queryRes = await store.query({ sessionId: "session-1" });
		expect(queryRes).toHaveLength(3);
		expect(queryRes.map((c) => c.commandText)).toContain(":wq");
		expect(queryRes.map((c) => c.commandText)).toContain(":q");
		expect(queryRes.map((c) => c.commandText)).toContain(":write");

		// 4. Query argument usage: should return blended arguments for :wq
		const argRes = await store.queryArgumentUsage({
			sessionId: "session-1",
			commandId: "wq",
			argumentIndex: 0,
		});
		expect(argRes).toHaveLength(1);
		expect(argRes[0]?.argumentValue).toBe("file.txt");
		expect(argRes[0]?.sessionCount).toBe(1);
	});

	it("compiles PG dialect ON CONFLICT syntax correctly via AST", () => {
		const compiler = new CommandHistoryQueryCompiler("postgres");
		const upsertCmd = compiler.compileUpsertCommandAggregate(
			":wq",
			"session",
			"session-1",
			"wq",
			"wq",
			1,
			0,
			"2026-08-04T12:00:00.000Z",
		);
		expect(upsertCmd.sql).toContain(
			'ON CONFLICT ("command_text", "scope", "scope_key") DO UPDATE SET',
		);
		expect(upsertCmd.sql).toContain(
			'"success_count" = success_count + EXCLUDED.success_count',
		);
	});
});
