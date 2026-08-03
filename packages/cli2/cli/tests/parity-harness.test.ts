import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import {
	compareParity,
	createNotebookParityRunner,
	type ParityAction,
} from "../src/lib/testing/parity-harness";

const cell = (id: string, rawInput: string) => ({
	cellId: id,
	sessionId: "session_1",
	collection: { kind: "notebook" as const, collectionId: "session_1" },
	intentKind: "prose" as const,
	mode: "cdsl" as const,
	rawInput,
	status: "draft" as const,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	routing: { scope: "global" as const },
	parsedOutput: [],
	warnings: [],
	errors: [],
});

function initialState() {
	return notebookReducer(INITIAL_NOTEBOOK_STATE, {
		type: "SET_CELLS",
		cells: [cell("a", "one"), cell("b", "two")],
	});
}

describe("P6 behavioral parity harness", () => {
	test("compares normalized document/editor snapshots", () => {
		const actions: ParityAction[] = [
			{ type: "document", action: { type: "move", delta: 1 } },
			{ type: "document", action: { type: "enterVisual" } },
			{ type: "document", action: { type: "extendSelection", delta: -1 } },
			{ type: "notebook", action: { type: "YANK_SELECTION" } },
			{ type: "notebook", action: { type: "EXIT_VISUAL_MODE" } },
		];
		const result = compareParity(
			createNotebookParityRunner(initialState()),
			createNotebookParityRunner(initialState()),
			actions,
		);
		expect(result.equal).toBe(true);
		expect(result.left.selection).toBeNull();
	});

	test("reports the first observable divergence", () => {
		const left = createNotebookParityRunner(initialState());
		const right = createNotebookParityRunner(initialState());
		const result = compareParity(left, right, [
			{ type: "notebook", action: { type: "MOVE_CURSOR", delta: 1 } },
		]);
		expect(result.equal).toBe(true);
		expect(result.firstDifference).toBeUndefined();
	});
});
