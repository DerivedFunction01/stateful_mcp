import { describe, expect, test } from "bun:test";
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import { resolveInitialSession } from "../src/lib/session/resolver";

function createStore(
	records: { sessionId: string; updatedAt: string }[],
): NotebookSessionStore {
	return {
		get: async (sessionId: string) =>
			records.find((r) => r.sessionId === sessionId) ?? null,
		list: async () =>
			records.map((r) => ({
				sessionId: r.sessionId,
				cellOrder: [],
				commandHistory: [],
				revision: 0,
				updatedAt: r.updatedAt,
			})),
		save: async () => {},
		delete: async () => {},
	};
}

describe("resolveInitialSession", () => {
	test("returns preferredId when provided", async () => {
		const store = createStore([
			{ sessionId: "a", updatedAt: "2026-01-01T00:00:00Z" },
			{ sessionId: "b", updatedAt: "2026-01-02T00:00:00Z" },
		]);
		expect(await resolveInitialSession(store, "a")).toBe("a");
		expect(await resolveInitialSession(store, "c")).toBe("c");
	});

	test("returns MRU session when no preferredId", async () => {
		const store = createStore([
			{ sessionId: "a", updatedAt: "2026-01-01T00:00:00Z" },
			{ sessionId: "b", updatedAt: "2026-01-03T00:00:00Z" },
			{ sessionId: "c", updatedAt: "2026-01-02T00:00:00Z" },
		]);
		expect(await resolveInitialSession(store)).toBe("b");
	});

	test("generates new id when store is empty", async () => {
		const store = createStore([]);
		const result = await resolveInitialSession(store);
		expect(result).toMatch(/^cli2-\d+$/);
	});
});
