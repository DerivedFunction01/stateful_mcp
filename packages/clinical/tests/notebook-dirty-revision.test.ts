import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "../src/notebook/notebook-state";
import type { Cell } from "../src/session/cell";

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
	collection: { kind: "notebook", collectionId: "s1" },
	intentKind: "prose",
};

describe("notebook dirty revision tracking", () => {
	test("starts clean", () => {
		expect(INITIAL_NOTEBOOK_STATE.authoredRevision).toBe(0);
		expect(INITIAL_NOTEBOOK_STATE.persistedAuthoredRevision).toBe(0);
		expect(INITIAL_NOTEBOOK_STATE.dirty).toBe(false);
	});

	test("INSERT_CELL increments authoredRevision and marks dirty", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell: mockCell,
			position: 0,
		});

		expect(state.authoredRevision).toBe(1);
		expect(state.persistedAuthoredRevision).toBe(0);
		expect(state.dirty).toBe(true);
	});

	test("SET_PERSISTED_REVISION aligns persisted revision and clears dirty", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell: mockCell,
			position: 0,
		});

		expect(state.dirty).toBe(true);

		state = notebookReducer(state, {
			type: "SET_PERSISTED_REVISION",
			revision: 1,
		});

		expect(state.persistedAuthoredRevision).toBe(1);
		expect(state.dirty).toBe(false);
	});

	test("undoing reverts authoredRevision and recovers dirty status", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		
		// Insert cell (revision -> 1, dirty -> true)
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell: mockCell,
			position: 0,
		});

		// Exit insert mode (revision -> 2, dirty -> true)
		state = notebookReducer(state, {
			type: "EXIT_INSERT_MODE",
		});

		// Mark persisted at revision 2
		state = notebookReducer(state, {
			type: "SET_PERSISTED_REVISION",
			revision: 2,
		});
		expect(state.dirty).toBe(false);

		// Undo: should revert to revision 1 (dirty -> true)
		state = notebookReducer(state, { type: "UNDO" });
		expect(state.authoredRevision).toBe(1);
		expect(state.dirty).toBe(true);
	});
});
