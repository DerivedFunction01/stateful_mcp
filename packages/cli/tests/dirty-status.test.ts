import { describe, expect, test } from "bun:test";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	reduceNotebookEditor,
} from "@stateful-mcp/clinical/notebook/notebook-state";

const cell = {
	cellId: "cell_1",
	sessionId: "session_1",
	collection: { kind: "notebook", collectionId: "session_1" },
	intentKind: "prose",
	mode: "cdsl",
	rawInput: "existing text",
	status: "draft",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	routing: { scope: "global" },
	parsedOutput: [],
	warnings: [],
	errors: [],
} as any;

describe("dirty status via authored/persisted revision", () => {
	test("initial state is clean", () => {
		const state = INITIAL__NOTEBOOK_EDITOR_STATE;
		expect(state.authoredRevision).toBe(0);
		expect(state.persistedAuthoredRevision).toBe(0);
		expect(state.authoredRevision).not.toBeGreaterThan(
			state.persistedAuthoredRevision,
		);
	});

	test("mutating draft text increments authored revision", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, { type: "set_mode", mode: "INSERT" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "x" });
		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
		expect(state.authoredRevision).toBeGreaterThan(
			state.persistedAuthoredRevision,
		);
	});

	test("mutating command line increments authored revision", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, { type: "set_mode", mode: "COMMAND" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "h" });
		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
	});

	test("mark_clean syncs persisted revision to authored revision", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, { type: "set_mode", mode: "INSERT" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "x" });
		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
		state = reduceNotebookEditor(state, { type: "mark_clean" });
		expect(state.persistedAuthoredRevision).toBe(1);
		expect(state.authoredRevision).toBe(state.persistedAuthoredRevision);
	});

	test("remove_cells increments authored revision", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, {
			type: "remove_cells",
			cellIds: ["cell_1"],
		});
		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
		expect(state.cells).toHaveLength(0);
	});

	test("paste_cells increments authored revision", () => {
		const pasted = {
			...cell,
			cellId: "cell_2",
			authored: { ...cell.authored, rawText: "pasted" },
		};
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, {
			type: "paste_cells",
			cells: [pasted],
			insertIndex: 1,
		});
		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
		expect(state.cells).toHaveLength(2);
	});

	test("set_persisted_revision updates persisted revision without changing authored", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, { type: "set_mode", mode: "INSERT" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "x" });
		expect(state.authoredRevision).toBe(1);
		state = reduceNotebookEditor(state, {
			type: "set_persisted_revision",
			revision: 1,
		});
		expect(state.persistedAuthoredRevision).toBe(1);
		expect(state.authoredRevision).toBe(1);
		expect(state.authoredRevision).toBe(state.persistedAuthoredRevision);
	});

	test("multiple mutations accumulate authored revision", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = reduceNotebookEditor(state, { type: "set_mode", mode: "INSERT" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "a" });
		state = reduceNotebookEditor(state, { type: "append_text", text: "b" });
		state = reduceNotebookEditor(state, { type: "backspace" });
		expect(state.authoredRevision).toBe(3);
		expect(state.persistedAuthoredRevision).toBe(0);
	});
});
