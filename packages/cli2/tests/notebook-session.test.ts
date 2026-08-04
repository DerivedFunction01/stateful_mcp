import { describe, expect, it } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-session";
import { reconcileNotebookCells } from "../src/lib/session/notebook-session";

describe("NotebookSession", () => {
	it("loads the persisted editor snapshot and creates a real structured cell", async () => {
		const bootstrapped = await bootstrapSession({
			sessionId: `cli2-notebook-session-test-${Date.now()}`,
		});
		const notebook = bootstrapped.notebook;

		const initial = await notebook.loadEditorSnapshot();
		expect(initial.record.documentId).toBe(bootstrapped.caseIdentity.documentId);
		const initialCellIds = initial.cells
			.map((item) => item.cellId)
			.filter((cellId): cellId is string => Boolean(cellId));

		const cell = await notebook.createCell({
			collection: {
				kind: "notebook",
				collectionId: bootstrapped.sessionId,
			},
			rawText: "",
		});
		expect(cell.sessionId).toBe(bootstrapped.sessionId);
		expect(cell.lifecycle.status).toBe("draft");
		expect(cell.authored.rawText).toBe("");

		const loaded = await notebook.loadEditorSnapshot();
		expect(loaded.cells.map((item) => item.cellId)).toContain(cell.cellId);
		expect(loaded.activeCellId).toBe(cell.cellId);
		expect(loaded.record.cellOrder).toContain(cell.cellId);
	});

	it("reconciles persisted order without duplicating or fabricating cells", () => {
		const cell = (cellId: string) => ({ cellId }) as any;
		const ordered = reconcileNotebookCells(
			[cell("b"), cell("a"), cell("c")],
			["missing", "a", "a", "c"],
		);
		expect(ordered.map((item) => item.cellId)).toEqual(["a", "c", "b"]);
	});

	it("persists explicit insertion positions", async () => {
		const bootstrapped = await bootstrapSession({
			sessionId: `cli2-notebook-position-${Date.now()}`,
		});
		const notebook = bootstrapped.notebook;
		const first = await notebook.createCell({
			collection: { kind: "notebook", collectionId: bootstrapped.sessionId },
			rawText: "first",
		});
		const second = await notebook.createCell({
			collection: { kind: "notebook", collectionId: bootstrapped.sessionId },
			rawText: "second",
			position: 0,
		});
		const snapshot = await notebook.loadEditorSnapshot();
		expect(snapshot.record.cellOrder.indexOf(second.cellId)).toBe(0);
		expect(snapshot.record.cellOrder.indexOf(first.cellId)).toBe(1);
	});
});
