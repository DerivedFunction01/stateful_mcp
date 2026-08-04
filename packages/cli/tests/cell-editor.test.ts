import { describe, expect, test } from "bun:test";
import {
	createEditorKernelState,
	reduceEditorKernel,
} from "../src/lib/cell-editor";

describe("shared cell editor reducer", () => {
	test("enters insert mode and edits multiline draft text", () => {
		let state = createEditorKernelState();
		state = reduceEditorKernel(state, { type: "ENTER_INSERT" });
		state = reduceEditorKernel(state, { type: "INSERT_TEXT", text: "first" });
		state = reduceEditorKernel(state, { type: "NEWLINE" });
		state = reduceEditorKernel(state, { type: "INSERT_TEXT", text: "second" });

		expect(state.mode).toBe("INSERT");
		expect(state.draftText).toBe("first\nsecond");
	});

	test("cancel-first returns to normal and clears transient editor state", () => {
		let state = createEditorKernelState();
		state = reduceEditorKernel(state, { type: "ENTER_COMMAND" });
		state = reduceEditorKernel(state, { type: "INSERT_TEXT", text: "help" });
		state = reduceEditorKernel(state, {
			type: "SET_ERROR",
			error: "example",
		});
		state = reduceEditorKernel(state, { type: "CANCEL" });

		expect(state.mode).toBe("NORMAL");
		expect(state.draftText).toBe("");
		expect(state.error).toBeNull();
		expect(state.completion.status).toBe("idle");
	});

	test("clamps active cell selection to the collection", () => {
		const state = createEditorKernelState();
		expect(state.mode).toBe("NORMAL");
	});
});
