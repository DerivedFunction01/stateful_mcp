import { describe, expect, test } from "bun:test";
import { SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { Cell } from "../src/session/cell";
import { SqlNotebookStore } from "../src/store/notebook/sql-notebook-store";

function makeCell(cellId: string, sessionId: string, raw = ""): Cell {
	return {
		cellId,
		sessionId,
		mode: "cdsl",
		rawInput: raw,
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		context: { objects: {} },
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

async function sqliteStore(): Promise<SqlNotebookStore> {
	const backend = await SqlBackend.connect("sqlite", ":memory:");
	return new SqlNotebookStore("sqlite", new SqlExecutor(backend));
}

describe("SqlNotebookStore", () => {
	test("DDL creates notebook_sessions + notebook_cells with position-sorted ordering", async () => {
		const store = await sqliteStore();
		const cell = makeCell("c1", "s1", "text");
		await store.insertCell("s1", cell, 0);

		const doc = await store.loadDocument("s1");
		expect(doc).not.toBeNull();
		expect(doc!.ordering).toEqual(["c1"]);

		// The store includes a matching cell table and an index by session.
		const executor = (store as any).executor as SqlExecutor;
		const sessions = await executor.query(
			"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notebook_sessions','notebook_cells') ORDER BY name",
		);
		expect(sessions.map((r: any) => r.name)).toEqual([
			"notebook_cells",
			"notebook_sessions",
		]);
	});

	test("loadDocument/saveDocument round-trip preserves ordering and content", async () => {
		const store = await sqliteStore();
		await store.saveDocument({
			sessionId: "s1",
			updatedAt: "2026-01-01T00:00:00.000Z",
			ordering: ["c2", "c1"],
			cells: {
				c1: makeCell("c1", "s1", "first"),
				c2: makeCell("c2", "s1", "second"),
			},
			activeIndex: 1,
			draftText: "draft",
		});

		const loaded = await store.loadDocument("s1");
		expect(loaded).not.toBeNull();
		expect(loaded!.ordering).toEqual(["c2", "c1"]);
		expect(loaded!.cells["c2"]!.rawInput).toBe("second");
		expect(loaded!.activeIndex).toBe(1);
		expect(loaded!.draftText).toBe("draft");
	});

	test("loadDocument returns null for missing session", async () => {
		const store = await sqliteStore();
		expect(await store.loadDocument("missing")).toBeNull();
	});

	test("multi-session: getSessionIds returns both, loadDocument is independent", async () => {
		const store = await sqliteStore();
		await store.insertCell("sA", makeCell("cA1", "sA"), 0);
		await store.insertCell("sB", makeCell("cB1", "sB"), 0);

		const ids = await store.getSessionIds();
		expect(ids.sort()).toEqual(["sA", "sB"]);

		const a = await store.loadDocument("sA");
		const b = await store.loadDocument("sB");
		expect(a!.ordering).toEqual(["cA1"]);
		expect(b!.ordering).toEqual(["cB1"]);
		expect(a!.cells["cB1"]).toBeUndefined();
	});

	test("insertCell splices at exact position", async () => {
		const store = await sqliteStore();
		await store.insertCell("s1", makeCell("c1", "s1"), 0);
		await store.insertCell("s1", makeCell("c3", "s1"), 1);
		await store.insertCell("s1", makeCell("c2", "s1"), 1);

		const doc = await store.loadDocument("s1");
		// saveDocument persists ordering via delete-then-insert; re-inserting c2 at position 1
		// after c1,c3 means ordering is c1,c2,c3.
		expect(doc!.ordering).toEqual(["c1", "c2", "c3"]);
	});

	test("moveCell reorders and round-trips", async () => {
		const store = await sqliteStore();
		await store.insertCell("s1", makeCell("c1", "s1"), 0);
		await store.insertCell("s1", makeCell("c2", "s1"), 1);
		await store.insertCell("s1", makeCell("c3", "s1"), 2);

		await store.moveCell("s1", "c3", 0);
		const doc = await store.loadDocument("s1");
		// split index 2 → 0 results in c3,c1,c2 (position 0 insertion).
		expect(doc!.ordering).toEqual(["c3", "c1", "c2"]);
	});

	test("deleteCell removes from ordering and cells", async () => {
		const store = await sqliteStore();
		await store.insertCell("s1", makeCell("c1", "s1"), 0);
		await store.insertCell("s1", makeCell("c2", "s1"), 1);
		await store.insertCell("s1", makeCell("c3", "s1"), 2);

		await store.deleteCell("s1", "c2");
		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c1", "c3"]);
		expect(doc!.cells["c2"]).toBeUndefined();
	});

	test("whole-doc save is idempotent (delete-then-insert per session)", async () => {
		const store = await sqliteStore();
		await store.saveDocument({
			sessionId: "s1",
			updatedAt: "2026-01-01T00:00:00.000Z",
			ordering: ["c1"],
			cells: { c1: makeCell("c1", "s1", "v1") },
			activeIndex: 0,
			draftText: "",
		});
		await store.saveDocument({
			sessionId: "s1",
			updatedAt: "2026-01-01T00:00:00.000Z",
			ordering: ["c1", "c2"],
			cells: {
				c1: makeCell("c1", "s1", "v2"),
				c2: makeCell("c2", "s1"),
			},
			activeIndex: 0,
			draftText: "",
		});

		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c1", "c2"]);
		expect(doc!.cells["c1"]!.rawInput).toBe("v2");
	});
});
