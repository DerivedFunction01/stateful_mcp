import { describe, expect, it } from "bun:test";
import { bootstrapSession } from "../src/lib/session/bootstrap-session";
import { reconcileNotebookCells } from "../src/lib/session/notebook-session";

describe("cli2  notebook session seam", () => {
	it("exposes  services without a legacy NotebookStore", async () => {
		const result = await bootstrapSession({ sessionId: "cli2-notebook" });
		const suggestions = await result.notebook.getAutocomplete({
			input: ":con",
			cursorOffset: 4,
			sessionId: result.sessionId,
		});
		expect(result.notebook.engine).toBe(result.engine);
		expect(result.notebook.sessionId).toBe("cli2-notebook");
		expect(
			suggestions.some((suggestion) =>
				suggestion.insertText.includes("confirm"),
			),
		).toBe(true);
	});

	it("loads and persists StructuredCell notebook state", async () => {
		const result = await bootstrapSession({ sessionId: "cli2-cell-session" });
		const created = await result.notebook.createCell({
			collection: { kind: "notebook", collectionId: result.sessionId },
			rawText: "draft text",
		});
		const snapshot = await result.notebook.loadEditorSnapshot();
		expect(snapshot.cells.map((cell) => cell.cellId)).toEqual([created.cellId]);
		expect(snapshot.record.cellOrder).toEqual([created.cellId]);
		expect(snapshot.activeCellId).toBe(created.cellId);

		await result.notebook.saveEditorSnapshot({
			cellOrder: [created.cellId],
			activeCellId: created.cellId,
			draftText: "draft text",
			editorMode: "INSERT",
			commandHistory: [":help"],
			expectedRevision: snapshot.record.revision,
		});
		const saved = await result.notebook.loadEditorSnapshot();
		expect(saved.record.draftText).toBe("draft text");
		expect(saved.record.editorMode).toBe("INSERT");
		expect(saved.record.commandHistory).toEqual([":help"]);
	});

	it("reconciles persisted order without losing unlisted cells", () => {
		const cells = [{ cellId: "a" }, { cellId: "b" }, { cellId: "c" }] as any;
		expect(
			reconcileNotebookCells(cells, ["missing", "c", "c", "a"]).map(
				(cell) => cell.cellId,
			),
		).toEqual(["c", "a", "b"]);
	});
});
