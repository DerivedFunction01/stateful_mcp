import { describe, expect, test } from "bun:test";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	type NotebookEditorState,
	reduceNotebookEditor,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { selectUnambiguousExpression } from "../src/hooks/useNotebook";

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

function beginMacroState(text: string): NotebookEditorState {
	const state = setMode(INITIAL__NOTEBOOK_EDITOR_STATE, "MACRO");
	return reduceNotebookEditor(state, { type: "set_draft", text });
}

describe("isolated notebook v2 state contract", () => {
	test("does not auto-lock a shorter expression while a longer one is possible", () => {
		const expressions = [
			{
				id: "short",
				term: "harry potter",
				conceptId: "c-short",
			},
			{
				id: "long",
				term: "harry potter and the deathly hallows",
				conceptId: "c-long",
			},
		];

		expect(selectUnambiguousExpression(expressions, "harry potter")).toBeUndefined();
		expect(
			selectUnambiguousExpression(
				expressions,
				"harry potter and the deathly hallows",
			)?.id,
		).toBe("long");
		expect(
			selectUnambiguousExpression(
				expressions,
				"harry potter and teh deathly hallows",
			)?.id,
		).toBe("short");
		expect(selectUnambiguousExpression(expressions, "harry potter 1")?.id).toBe(
			"short",
		);
	});
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

	test("typing after a locked slot preserves the slot text and lock", () => {
		let state = beginMacroState("^note hp");
		state = reduceNotebookEditor(state, {
			type: "add_macro_lock",
			lock: {
				argumentId: "title",
				macroId: "note",
				macroVersion: 1,
				start: 6,
				end: 8,
				lockedAtRevision: 1,
				source: "accepted",
				binding: {
					kind: "custom-expression",
					conceptId: "concept-hp",
					expressionId: "expression-hp",
					lookupTerm: "hp",
				},
			},
		});
		state = reduceNotebookEditor(state, { type: "cursor_end" });
		state = reduceNotebookEditor(state, {
			type: "append_text",
			text: " ",
		});

		expect(state.draftText).toBe("^note hp ");
		expect(state.macroLocks).toHaveLength(1);
		expect(state.macroLocks[0]?.binding?.expressionId).toBe("expression-hp");
	});

	test("inserts, moves, and deletes at the cursor offset", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_mode",
			mode: "INSERT",
		});
		state = reduceNotebookEditor(state, { type: "append_text", text: "abcd" });
		state = reduceNotebookEditor(state, { type: "set_cursor", offset: 2 });
		state = reduceNotebookEditor(state, { type: "append_text", text: "X" });
		expect(state.draftText).toBe("abXcd");
		expect(state.cursorOffset).toBe(3);
		state = reduceNotebookEditor(state, { type: "backspace" });
		expect(state.draftText).toBe("abcd");
		expect(state.cursorOffset).toBe(2);
	});

	test("locks the draft buffer to the cell that opened editing", () => {
		const state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: "^assessment",
		});
		expect(state.inputLock).toEqual({ cellId: "cell_1", mode: "MACRO" });
		expect(state.draftText).toBe("^assessment");
		const ended = reduceNotebookEditor(state, { type: "end_edit" });
		expect(ended.inputLock).toBeNull();
		expect(ended.cursorOffset).toBe(0);
	});

	test("adds, removes, and replaces macro locks at spans", () => {
		const lock = {
			argumentId: "severity",
			macroId: "assessment",
			macroVersion: 3,
			start: 24,
			end: 27,
			source: "explicit" as const,
		};
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: "ABCDEFGHIJKLMNOPQRSTUVWX120",
		});
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		expect(state.macroLocks).toHaveLength(1);
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		expect(state.macroLocks).toHaveLength(1);
		state = reduceNotebookEditor(state, {
			type: "add_macro_lock",
			lock: { ...lock, end: 29, rawText: "12000" },
		});
		expect(state.macroLocks).toHaveLength(1);
		expect(state.macroLocks[0]).toMatchObject({ end: 29, rawText: "12000" });
		state = reduceNotebookEditor(state, {
			type: "replace_locked_slot",
			lock: { ...lock, end: 29, rawText: "12000" },
			text: "999",
		});
		expect(state.draftText).toBe("ABCDEFGHIJKLMNOPQRSTUVWX999");
		expect(state.macroLocks).toHaveLength(0);
		expect(state.cursorOffset).toBe(27);
	});

	test("removing a macro lock does not alter draft text", () => {
		const lock = {
			argumentId: "severity",
			macroId: "assessment",
			macroVersion: 3,
			start: 24,
			end: 27,
			source: "explicit" as const,
		};
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: "^assessment severity 120",
		});
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		const removed = reduceNotebookEditor(state, {
			type: "remove_macro_lock",
			lock,
		});
		expect(removed.macroLocks).toHaveLength(0);
		expect(removed.draftText).toBe("^assessment severity 120");
	});

	test("undo and redo preserve macro lock state", () => {
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "set_cells",
			cells: [cell, { ...cell, cellId: "cell_2" }],
		});
		state = reduceNotebookEditor(state, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: "ABCDEFGHIJKLMNOPQRSTUVWX120",
		});
		const lock = {
			argumentId: "severity",
			macroId: "assessment",
			macroVersion: 3,
			start: 24,
			end: 27,
			source: "explicit" as const,
		};
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		state = reduceNotebookEditor(state, {
			type: "move_cell",
			cellId: "cell_1",
			targetIndex: 1,
		});
		expect(state.macroLocks).toHaveLength(1);
		state = reduceNotebookEditor(state, { type: "undo" });
		expect(state.macroLocks).toHaveLength(1);
		state = reduceNotebookEditor(state, { type: "redo" });
		expect(state.macroLocks).toHaveLength(1);
	});

	test("typing inside a locked slot inserts plain text and removes its lock", () => {
		const draftText = "ABCDEFGHIJKLMNOPQRSTUVWX120";
		const lock = {
			argumentId: "severity",
			macroId: "assessment",
			macroVersion: 3,
			start: 24,
			end: 27,
			source: "explicit" as const,
		};
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: draftText,
		});
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		// Place cursor inside the locked span, then type.
		state = reduceNotebookEditor(state, { type: "set_cursor", offset: 25 });
		state = reduceNotebookEditor(state, { type: "append_text", text: "9" });
		expect(state.draftText).toBe("ABCDEFGHIJKLMNOPQRSTUVWX1920");
		expect(state.macroLocks).toHaveLength(0);
		expect(state.cursorOffset).toBe(26);
	});

	test("typing at the start of a locked slot inserts before it", () => {
		const draftText = "ABCDEFGHIJKLMNOPQRSTUVWXhp";
		const lock = {
			argumentId: "title",
			macroId: "note",
			macroVersion: 1,
			start: 24,
			end: 26,
			source: "accepted" as const,
		};
		let state = reduceNotebookEditor(INITIAL__NOTEBOOK_EDITOR_STATE, {
			type: "begin_edit",
			cellId: "cell_1",
			mode: "MACRO",
			text: draftText,
		});
		state = reduceNotebookEditor(state, { type: "add_macro_lock", lock });
		state = reduceNotebookEditor(state, { type: "set_cursor", offset: 24 });
		state = reduceNotebookEditor(state, { type: "append_text", text: "s" });

		expect(state.draftText).toBe("ABCDEFGHIJKLMNOPQRSTUVWXshp");
		expect(state.macroLocks).toHaveLength(1);
		expect(state.macroLocks[0]).toMatchObject({ start: 25, end: 27 });
		expect(state.cursorOffset).toBe(25);
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
