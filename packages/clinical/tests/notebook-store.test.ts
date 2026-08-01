import { describe, expect, test } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import type { Cell } from "../src/session/cell";
import type { NotebookSessionDocument } from "../src/store/notebook/interfaces";
import { KvNotebookStore } from "../src/store/notebook/kv-notebook-store";

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
		updatedAt: `2026-01-01T00:00:00.000Z`,
	};
}

function makeDoc(
	sessionId: string,
	cells: Cell[],
	overrides: Partial<NotebookSessionDocument> = {},
): NotebookSessionDocument {
	return {
		sessionId,
		updatedAt: "2026-01-01T00:00:00.000Z",
		ordering: cells.map((c) => c.cellId),
		cells: Object.fromEntries(cells.map((c) => [c.cellId, c])),
		activeIndex: 0,
		draftText: "",
		...overrides,
	};
}

describe("KvNotebookStore", () => {
	test("loadDocument/saveDocument round-trip", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		const doc = makeDoc("s1", [
			makeCell("c1", "s1", "#vital temp 38.9 C"),
			makeCell("c2", "s1", "patient complaining of pain"),
		]);

		await store.saveDocument(doc);

		const loaded = await store.loadDocument("s1");
		expect(loaded).not.toBeNull();
		expect(loaded!.sessionId).toBe("s1");
		expect(loaded!.ordering).toEqual(["c1", "c2"]);
		expect(loaded!.cells["c1"]!.rawInput).toBe("#vital temp 38.9 C");
		expect(loaded!.cells["c2"]!.rawInput).toBe("patient complaining of pain");
	});

	test("loadDocument returns null for missing session", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		expect(await store.loadDocument("missing")).toBeNull();
	});

	test("multi-session: getSessionIds returns both, loadDocument is independent", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(makeDoc("sA", [makeCell("cA1", "sA")]));
		await store.saveDocument(makeDoc("sB", [makeCell("cB1", "sB")]));

		const ids = await store.getSessionIds();
		expect(ids.sort()).toEqual(["sA", "sB"]);

		const a = await store.loadDocument("sA");
		const b = await store.loadDocument("sB");
		expect(a!.ordering).toEqual(["cA1"]);
		expect(b!.ordering).toEqual(["cB1"]);
		expect(a!.cells["cB1"]).toBeUndefined();
	});

	test("insertCell appends at end when position is out of range", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(makeDoc("s1", [makeCell("c1", "s1")]));

		await store.insertCell("s1", makeCell("c2", "s1"), 99);
		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c1", "c2"]);
	});

	test("insertCell splices at exact position", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(
			makeDoc("s1", [makeCell("c1", "s1"), makeCell("c3", "s1")]),
		);

		await store.insertCell("s1", makeCell("c2", "s1"), 1);
		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c1", "c2", "c3"]);
	});

	test("moveCell reorders and round-trips", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(
			makeDoc("s1", [
				makeCell("c1", "s1"),
				makeCell("c2", "s1"),
				makeCell("c3", "s1"),
			]),
		);

		await store.moveCell("s1", "c3", 0);
		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c3", "c1", "c2"]);
	});

	test("deleteCell removes from ordering and cells", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(
			makeDoc("s1", [
				makeCell("c1", "s1"),
				makeCell("c2", "s1"),
				makeCell("c3", "s1"),
			]),
		);

		await store.deleteCell("s1", "c2");
		const doc = await store.loadDocument("s1");
		expect(doc!.ordering).toEqual(["c1", "c3"]);
		expect(doc!.cells["c2"]).toBeUndefined();
	});

	test("getCell returns cell or null", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(makeDoc("s1", [makeCell("c1", "s1", "text")]));

		expect((await store.getCell("s1", "c1"))?.rawInput).toBe("text");
		expect(await store.getCell("s1", "missing")).toBeNull();
	});

	test("listSession returns position-sorted refs", async () => {
		const store = new KvNotebookStore(new MemoryKvBackend());
		await store.saveDocument(
			makeDoc("s1", [makeCell("c1", "s1"), makeCell("c2", "s1")]),
		);

		const refs = await store.listSession("s1");
		expect(refs.map((r) => r.cellId)).toEqual(["c1", "c2"]);
		expect(refs.map((r) => r.position)).toEqual([0, 1]);
		expect(refs[0]!.sessionId).toBe("s1");
	});
});
