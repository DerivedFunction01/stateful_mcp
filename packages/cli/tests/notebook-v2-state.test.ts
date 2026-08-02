import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
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

describe("isolated notebook v2 state contract", () => {
	test("entering insert loads the active cell draft and commit preserves it", () => {
		let state = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "SET_CELLS",
			cells: [cell],
		});
		state = notebookReducer(state, { type: "ENTER_INSERT_MODE" });
		expect(state.draftText).toBe("existing text");
		expect(state.mode).toBe("INSERT");

		state = notebookReducer(state, { type: "TYPE_CHAR", char: "!" });
		state = notebookReducer(state, { type: "EXIT_INSERT_MODE" });
		expect(state.cells[0]?.rawInput).toBe("existing text!");
		expect(state.mode).toBe("NORMAL");
	});

	test("command state is separate from cell draft state", () => {
		let state = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "SET_CELLS",
			cells: [cell],
		});
		state = notebookReducer(state, { type: "ENTER_COMMAND_MODE" });
		state = notebookReducer(state, { type: "COMMAND_APPEND", char: "h" });

		expect(state.commandLine).toBe(":h");
		expect(state.draftText).toBe("");
		expect(state.cells[0]?.rawInput).toBe("existing text");
	});

	test("exiting visual mode returns to normal", () => {
		let state = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "SET_CELLS",
			cells: [cell],
		});
		state = notebookReducer(state, { type: "ENTER_VISUAL_MODE" });
		expect(state.mode).toBe("VISUAL");

		state = notebookReducer(state, { type: "EXIT_VISUAL_MODE" });
		expect(state.mode).toBe("NORMAL");
	});

	test("two state owners remain independent", () => {
		let first = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "SET_CELLS",
			cells: [cell],
		});
		const second = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "SET_CELLS",
			cells: [structuredClone(cell)],
		});
		first = notebookReducer(first, { type: "ENTER_INSERT_MODE" });
		first = notebookReducer(first, { type: "TYPE_CHAR", char: " first" });

		expect(first.draftText).toContain("first");
		expect(second.draftText).toBe("");
		expect(second.cells[0]?.rawInput).toBe("existing text");
	});
});
