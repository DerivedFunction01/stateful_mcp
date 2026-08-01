import { describe, expect, test } from "bun:test";
import {
	createCellEditorState,
	reduceCellEditor,
} from "../src/lib/cell-editor";

const collection = { kind: "workspace" as const, collectionId: "work_1" };

describe("shared cell editor reducer", () => {
	test("enters insert mode and edits multiline draft text", () => {
		let state = createCellEditorState(collection);
		state = reduceCellEditor(state, { type: "ENTER_INSERT" });
		state = reduceCellEditor(state, { type: "INSERT_TEXT", text: "first" });
		state = reduceCellEditor(state, { type: "NEWLINE" });
		state = reduceCellEditor(state, { type: "INSERT_TEXT", text: "second" });

		expect(state.mode).toBe("INSERT");
		expect(state.draftText).toBe("first\nsecond");
	});

	test("cancel-first returns to normal and clears transient editor state", () => {
		let state = createCellEditorState(collection);
		state = reduceCellEditor(state, { type: "ENTER_COMMAND" });
		state = reduceCellEditor(state, { type: "INSERT_TEXT", text: "help" });
		state = reduceCellEditor(state, {
			type: "SET_ERROR",
			error: "example",
		});
		state = reduceCellEditor(state, { type: "CANCEL" });

		expect(state.mode).toBe("NORMAL");
		expect(state.draftText).toBe("");
		expect(state.error).toBeNull();
		expect(state.completion.status).toBe("idle");
	});

	test("clamps active cell selection to the collection", () => {
		let state = createCellEditorState(collection, []);
		state = reduceCellEditor(state, { type: "SET_ACTIVE_INDEX", index: 99 });
		expect(state.activeIndex).toBe(0);
	});
});
