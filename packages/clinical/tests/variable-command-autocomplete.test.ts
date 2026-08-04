import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvCommandHistoryStore } from "../src/learning/kv-command-history-store";

describe("variable autocomplete history ranking", () => {
	it("records structured arguments and queries usage counts", async () => {
		const store = new KvCommandHistoryStore(new MemoryKvBackend());

		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":var set patient.weight=70",
			canonicalVerb: "var",
			commandId: "var",
			executedAt: "2026-08-04T12:00:00.000Z",
			args: [
				{ index: 0, value: "set" },
				{ index: 1, value: "patient.weight=70" },
			],
		});

		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":var set baseline_date=2026-08-04",
			canonicalVerb: "var",
			commandId: "var",
			executedAt: "2026-08-04T13:00:00.000Z",
			args: [
				{ index: 0, value: "set" },
				{ index: 1, value: "baseline_date=2026-08-04" },
			],
		});

		// Query usage for argument index 0 (operations)
		const operations = await store.queryArgumentUsage({
			sessionId: "session-1",
			commandId: "var",
			argumentIndex: 0,
		});

		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({
			argumentValue: "set",
			sessionCount: 2,
			allCount: 2,
		});

		// Query usage for argument index 1 conditioned on set
		const vars = await store.queryArgumentUsage({
			sessionId: "session-1",
			commandId: "var",
			argumentIndex: 1,
			priorArguments: ["set"],
		});

		expect(vars).toHaveLength(2);
		expect(vars[0]?.argumentValue).toBe("baseline_date=2026-08-04");
		expect(vars[1]?.argumentValue).toBe("patient.weight=70");
	});

	it("filters arguments by prefix case-insensitively", async () => {
		const store = new KvCommandHistoryStore(new MemoryKvBackend());

		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":future alpha one",
			canonicalVerb: "future",
			args: [
				{ index: 0, value: "alpha" },
				{ index: 1, value: "one" },
			],
		});

		const result = await store.queryArgumentUsage({
			sessionId: "session-1",
			commandId: "future",
			argumentIndex: 1,
			prefix: "O",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.argumentValue).toBe("one");
	});
});
