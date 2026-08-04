import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvCommandHistoryStore } from "../src/learning/kv-command-history-store";

describe("command history store", () => {
	it("records session and all scopes and merges them by command", async () => {
		const store = new KvCommandHistoryStore(new MemoryKvBackend());
		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":wq",
			executedAt: "2026-08-04T12:00:00.000Z",
		});
		await store.recordSuccess({
			sessionId: "session-2",
			commandText: ":wq",
			executedAt: "2026-08-04T13:00:00.000Z",
		});

		const merged = await store.query({ sessionId: "session-1" });
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({
			commandText: ":wq",
			sessionCount: 1,
			allCount: 2,
		});
	});

	it("limits session queries and filters by normalized prefix", async () => {
		const store = new KvCommandHistoryStore(new MemoryKvBackend());
		await store.recordSuccess({
			sessionId: "session-1",
			commandText: ":write",
		});
		await store.recordSuccess({ sessionId: "session-1", commandText: ":wq" });
		await store.recordSuccess({ sessionId: "session-1", commandText: ":quit" });

		const result = await store.query({
			sessionId: "session-1",
			scope: "session",
			prefix: " :W",
			limit: 1,
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.commandText).toBe(":write");
	});
});
