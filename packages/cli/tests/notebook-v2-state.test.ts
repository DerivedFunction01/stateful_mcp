import { describe, expect, test } from "bun:test";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	type NotebookEditorState,
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

function setMode(
	state: NotebookEditorState,
	mode: NotebookEditorState["mode"],
): NotebookEditorState {
	return reduceNotebookEditor(state, { type: "set_mode", mode });
}

describe("isolated notebook v2 state contract", () => {
	test("set_mode changes editor mode without mutating cells", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = setMode(state, "INSERT");
		expect(state.mode).toBe("INSERT");
		expect(state.draftText).toBe("");
		expect(state.cells[0]?.rawInput).toBe("existing text");
	});

	test("append_text in insert mode builds draft text and marks dirty", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = setMode(state, "INSERT");
		state = reduceNotebookEditor(state, { type: "append_text", text: "!" });
		expect(state.draftText).toBe("!");
		expect(state.authoredRevision).toBeGreaterThan(
			state.persistedAuthoredRevision,
		);
		expect(state.cells[0]?.rawInput).toBe("existing text");
	});

	test("append_text in command mode builds command line and marks dirty", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = setMode(state, "COMMAND");
		state = reduceNotebookEditor(state, { type: "append_text", text: "h" });

		expect(state.commandLine).toBe("h");
		expect(state.draftText).toBe("");
		expect(state.authoredRevision).toBeGreaterThan(
			state.persistedAuthoredRevision,
		);
		expect(state.cells[0]?.rawInput).toBe("existing text");
	});

	test("set_mode to visual and back to normal", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		state = setMode(state, "VISUAL");
		expect(state.mode).toBe("VISUAL");

		state = setMode(state, "NORMAL");
		expect(state.mode).toBe("NORMAL");
	});

	test("two state owners remain independent", () => {
		let first = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell],
		});
		const second = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [structuredClone(cell)],
		});
		first = setMode(first, "INSERT");
		first = reduceNotebookEditor(first, {
			type: "append_text",
			text: " first",
		});

		expect(first.draftText).toContain("first");
		expect(second.draftText).toBe("");
		expect(second.cells[0]?.rawInput).toBe("existing text");
	});

	test("command history navigation uses stored history", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_command_history",
			history: [":workspace"],
		});
		state = reduceNotebookEditor(state, {
			type: "set_command_history",
			history: [":workspace", ":help"],
		});
		state = reduceNotebookEditor(state, { type: "COMMAND_HISTORY_PREV" });
		expect(state.commandLine).toBe(":help");
		state = reduceNotebookEditor(state, { type: "COMMAND_HISTORY_PREV" });
		expect(state.commandLine).toBe(":workspace");
	});
});
