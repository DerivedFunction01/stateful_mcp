import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import type { Cell } from "@stateful-mcp/clinical/session/cell";

const mockCell: Cell = {
	cellId: "c1",
	sessionId: "s1",
	mode: "cdsl",
	rawInput: "original text",
	routing: { scope: "global", targetSchema: null },
	parsedOutput: null,
	status: "draft",
	context: { objects: {} },
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("dirty status workflow", () => {
	test("initially not dirty", () => {
		expect(INITIAL_NOTEBOOK_STATE.dirty).toBe(false);
	});

	test("inserting a cell marks dirty", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell: mockCell,
			position: 0,
		});
		expect(state.dirty).toBe(true);
	});

	test("editing cell text marks dirty, saving clears dirty", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "SET_CELLS",
			cells: [mockCell],
		});
		expect(state.dirty).toBe(false); // set cells isn't authored edit

		// Simulate editing text
		state = notebookReducer(state, {
			type: "ENTER_INSERT_MODE",
		});
		state = notebookReducer(state, {
			type: "SET_DRAFT_TEXT",
			text: "modified text",
		});
		state = notebookReducer(state, {
			type: "EXIT_INSERT_MODE",
		});

		expect(state.dirty).toBe(true);

		// Simulate saving
		state = notebookReducer(state, {
			type: "SET_PERSISTED_REVISION",
			revision: state.authoredRevision,
		});
		expect(state.dirty).toBe(false);
	});

	test("derived updates (e.g. status executing) do not mark dirty", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "SET_CELLS",
			cells: [mockCell],
		});
		expect(state.dirty).toBe(false);

		// Execute update status
		state = notebookReducer(state, {
			type: "UPDATE_CELL",
			cellId: "c1",
			updater: (c: any) => ({ ...c, status: "executing" }),
		});
		expect(state.dirty).toBe(false); // rawInput did not change!
	});
});
