import { describe, expect, test } from "bun:test";
import {
	createScratchpadEditorState,
	reduceScratchpadEditorState,
} from "../src/lib/scratchpad-editor-state";

describe("scratchpad editor state machine", () => {
	test("moves one cell at a time and clamps the logical caret", () => {
		let state = createScratchpadEditorState(true);
		state = reduceScratchpadEditorState(state, {
			type: "setActiveCell",
			index: 1,
			count: 4,
		});
		state = reduceScratchpadEditorState(state, {
			type: "moveCharacter",
			delta: 1,
			lineLength: 8,
		});
		state = reduceScratchpadEditorState(state, {
			type: "moveCell",
			delta: 1,
			count: 4,
			lineLength: 2,
		});

		expect(state.activeCellIndex).toBe(2);
		expect(state.caretColumn).toBe(1);
		state = reduceScratchpadEditorState(state, {
			type: "moveCell",
			delta: 1,
			count: 4,
			lineLength: 20,
		});
		expect(state.activeCellIndex).toBe(3);
		expect(state.caretColumn).toBe(1);
		state = reduceScratchpadEditorState(state, {
			type: "moveCell",
			delta: 1,
			count: 4,
			lineLength: 20,
		});
		expect(state.activeCellIndex).toBe(3);
	});

	test("keeps visual range separate from native caret state", () => {
		let state = createScratchpadEditorState(true);
		state = reduceScratchpadEditorState(state, {
			type: "setActiveCell",
			index: 1,
			count: 4,
		});
		state = reduceScratchpadEditorState(state, { type: "beginVisual" });
		state = reduceScratchpadEditorState(state, {
			type: "extendVisual",
			delta: 1,
			count: 4,
		});

		expect(state.visualRange).toEqual({ start: 1, end: 2 });
		state = reduceScratchpadEditorState(state, { type: "swapVisualAnchor" });
		expect(state.visualRange).toEqual({ start: 2, end: 1 });
		expect(state.activeCellIndex).toBe(1);
		state = reduceScratchpadEditorState(state, { type: "clearVisual" });
		expect(state.visualRange).toBeNull();
		expect(state.mode).toBe("NORMAL");
	});

	test("disabling Vim produces native editor state and clears transient Vim state", () => {
		let state = createScratchpadEditorState(true);
		state = reduceScratchpadEditorState(state, { type: "beginVisual" });
		state = reduceScratchpadEditorState(state, {
			type: "setSequence",
			value: "g",
		});
		state = reduceScratchpadEditorState(state, {
			type: "setEnabled",
			enabled: false,
		});

		expect(state.enabled).toBe(false);
		expect(state.mode).toBe("INSERT");
		expect(state.visualRange).toBeNull();
		expect(state.sequenceBuffer).toBe("");
	});
});
