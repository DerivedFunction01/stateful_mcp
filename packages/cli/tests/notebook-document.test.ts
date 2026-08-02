import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { NotebookDocumentPort } from "../src/lib/windows/notebook/document";

const baseCell = (id: string) => ({
	cellId: id,
	sessionId: "session_1",
	collection: { kind: "notebook", collectionId: "session_1" },
	intentKind: "prose",
	mode: "cdsl",
	rawInput: `text ${id}`,
	status: "draft",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	routing: { scope: "global" },
	parsedOutput: [],
	warnings: [],
	errors: [],
});

function harness() {
	const actionLog: string[] = [];
	let state = INITIAL_NOTEBOOK_STATE;
	const insertBelow = () => {
		const cell = baseCell(`new_${state.cells.length}`);
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell,
			position: state.activeIndex + 1,
		});
	};
	const insertAbove = () => {
		const cell = baseCell(`new_${state.cells.length}`);
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell,
			position: state.activeIndex,
		});
	};
	const send = (action: any) => {
		actionLog.push(action.type);
		state = notebookReducer(state, action);
	};
	const port = new NotebookDocumentPort(state, send, {
		insertBelow,
		insertAbove,
	});
	return {
		port,
		send,
		insertBelow,
		insertAbove,
		getState: () => state,
		actionLog,
	};
}

describe("Phase 3 — notebook document operations", () => {
	test("insertBelow/insertAbove create and select cells", () => {
		let state = notebookReducer(INITIAL_NOTEBOOK_STATE, {
			type: "INSERT_CELL",
			cell: baseCell("a"),
			position: 0,
		});
		state = notebookReducer(state, {
			type: "INSERT_CELL",
			cell: baseCell("b"),
			position: 1,
		});
		expect(state.activeIndex).toBe(1); // INSERT_CELL selects inserted position

		const port = new NotebookDocumentPort(
			state,
			(action) => (state = notebookReducer(state, action)),
			{
				insertBelow: () => {
					state = notebookReducer(state, {
						type: "INSERT_CELL",
						cell: baseCell("c"),
						position: state.activeIndex + 1,
					});
				},
				insertAbove: () => {
					state = notebookReducer(state, {
						type: "INSERT_CELL",
						cell: baseCell("d"),
						position: state.activeIndex,
					});
				},
			},
		);
		port.dispatch({ type: "insertBelow" });
		expect(state.cells.map((c: any) => c.cellId)).toEqual(["a", "b", "c"]);
		// activeIndex is now 2 (after inserting c below b)
		port.dispatch({ type: "insertAbove" });
		expect(state.cells.map((c: any) => c.cellId)).toEqual(["a", "b", "d", "c"]);
	});

	test("document move/delete/yank/paste/undo map to reducer actions", () => {
		const { port, actionLog, getState } = harness();
		port.dispatch({ type: "move", delta: 1 });
		expect(actionLog.at(-1)).toBe("MOVE_CURSOR");
		port.dispatch({ type: "deleteActive" });
		expect(actionLog.at(-1)).toBe("DELETE_ACTIVE_CELL");
		port.dispatch({ type: "yankActive" });
		expect(actionLog.at(-1)).toBe("YANK_CELL");
		port.dispatch({ type: "paste" });
		expect(actionLog.at(-1)).toBe("PASTE_CELL");
		port.dispatch({ type: "undo" });
		expect(actionLog.at(-1)).toBe("UNDO");
		port.dispatch({ type: "redo" });
		expect(actionLog.at(-1)).toBe("REDO");
		void getState;
	});

	test("visual selection actions map to visual reducer actions", () => {
		const { port, actionLog } = harness();
		port.dispatch({ type: "enterVisual" });
		expect(actionLog.at(-1)).toBe("ENTER_VISUAL_MODE");
		port.dispatch({ type: "extendSelection", delta: 1 });
		expect(actionLog.at(-1)).toBe("EXTEND_SELECTION");
		port.dispatch({ type: "deleteSelection" });
		expect(actionLog.at(-1)).toBe("DELETE_SELECTION");
		port.dispatch({ type: "yankSelection" });
		expect(actionLog.at(-1)).toBe("YANK_SELECTION");
	});

	test("getView projects selection with stable start/end", () => {
		const { send, getState } = harness();
		send({ type: "INSERT_CELL", cell: baseCell("a"), position: 0 });
		send({ type: "INSERT_CELL", cell: baseCell("b"), position: 1 });
		send({ type: "SET_ACTIVE_INDEX", index: 0 });
		send({ type: "ENTER_VISUAL_MODE" });
		send({ type: "EXTEND_SELECTION", delta: 1 });
		const state = getState();
		const port = new NotebookDocumentPort(state, () => {}, {
			insertBelow: () => {},
			insertAbove: () => {},
		});
		const view = port.getView();
		expect(view.selection).toEqual({ start: 0, end: 1 });
	});
});
