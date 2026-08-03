import { describe, expect, test } from "bun:test";
import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type {
	NotebookCellRef,
	NotebookSessionDocument,
} from "@stateful-mcp/clinical/store/notebook/interfaces";
import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";
import { resolveInitialSession } from "../src/lib/session/resolver";

function makeCell(cellId: string, sessionId: string, updatedAt: string): Cell {
	return {
		cellId,
		sessionId,
		mode: "cdsl",
		rawInput: "",
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		context: { objects: {} },
		updatedAt,
	};
}

function makeDoc(
	sessionId: string,
	cell: Cell | null,
	updatedAt: string,
): NotebookSessionDocument {
	return {
		sessionId,
		updatedAt,
		ordering: cell ? [cell.cellId] : [],
		cells: cell ? { [cell.cellId]: cell } : {},
		activeIndex: 0,
		draftText: "",
	};
}

class FakeNotebookStore implements NotebookStore {
	constructor(private docs: Record<string, NotebookSessionDocument>) {}

	async getSessionIds(): Promise<string[]> {
		return Object.keys(this.docs);
	}

	async loadDocument(
		sessionId: string,
	): Promise<NotebookSessionDocument | null> {
		return this.docs[sessionId] ?? null;
	}

	async saveDocument(_doc: NotebookSessionDocument): Promise<void> {}

	async listSession(sessionId: string): Promise<NotebookCellRef[]> {
		const doc = this.docs[sessionId];
		if (!doc) return [];
		return doc.ordering
			.map((id, position) => ({
				sessionId,
				cellId: id,
				position,
				updatedAt: doc.cells[id]?.updatedAt ?? doc.updatedAt,
			}))
			.filter((r) => doc.cells[r.cellId]);
	}

	async getCell(sessionId: string, cellId: string): Promise<Cell | null> {
		return this.docs[sessionId]?.cells[cellId] ?? null;
	}

	async insertCell(
		_sessionId: string,
		_cell: Cell,
		_position: number,
	): Promise<void> {}

	async deleteCell(_sessionId: string, _cellId: string): Promise<void> {}

	async moveCell(
		_sessionId: string,
		_cellId: string,
		_newPosition: number,
	): Promise<void> {}
}

describe("resolveInitialSession", () => {
	test("returns fresh tui id when no sessions exist", async () => {
		const store = new FakeNotebookStore({});
		const id = await resolveInitialSession(store);
		expect(id).toMatch(/^tui-\d+$/);
	});

	test("resumes latest-updated existing session", async () => {
		const store = new FakeNotebookStore({
			old: makeDoc(
				"old",
				makeCell("old_c", "old", "2026-01-01T00:00:00.000Z"),
				"2026-01-01T00:00:00.000Z",
			),
			recent: makeDoc(
				"recent",
				makeCell("recent_c", "recent", "2026-01-02T00:00:00.000Z"),
				"2026-01-02T00:00:00.000Z",
			),
		});
		const id = await resolveInitialSession(store);
		expect(id).toBe("recent");
	});

	test("falls back to doc-level updatedAt for empty sessions", async () => {
		const store = new FakeNotebookStore({
			old: makeDoc("old", null, "2026-01-01T00:00:00.000Z"),
			recent: makeDoc("recent", null, "2026-01-02T00:00:00.000Z"),
		});
		const id = await resolveInitialSession(store);
		expect(id).toBe("recent");
	});
});
