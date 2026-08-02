import type {
	NotebookAction,
	NotebookState,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { notebookReducer } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { DocumentAction } from "./cell-editor";

/** Normalized semantic actions shared by the v1/v2 parity runner. */
export type ParityAction =
	| { type: "notebook"; action: NotebookAction }
	| { type: "document"; action: DocumentAction };

export interface ParitySnapshot {
	activeIndex: number;
	draftText: string;
	commandLine: string;
	commandHistory: string[];
	mode: NotebookState["mode"];
	selection: { start: number; end: number } | null;
	cells: Array<{
		cellId: string;
		collection: NotebookState["cells"][number]["collection"];
		intentKind: string;
		rawInput: string;
		status: string;
	}>;
	undoDepth: number;
	redoDepth: number;
	preview: unknown;
	sessionMode: NotebookState["sessionMode"];
	message: string | null;
}

export interface ParityRunner {
	apply(action: ParityAction): void;
	snapshot(): ParitySnapshot;
}

function documentToNotebookAction(
	action: DocumentAction,
): NotebookAction | null {
	switch (action.type) {
		case "move":
			return { type: "MOVE_CURSOR", delta: action.delta };
		case "setActive":
			return { type: "SET_ACTIVE_INDEX", index: action.index };
		case "deleteActive":
			return { type: "DELETE_ACTIVE_CELL" };
		case "yankActive":
			return { type: "YANK_CELL" };
		case "paste":
			return { type: "PASTE_CELL" };
		case "undo":
			return { type: "UNDO" };
		case "redo":
			return { type: "REDO" };
		case "enterVisual":
			return { type: "ENTER_VISUAL_MODE" };
		case "extendSelection":
			return { type: "EXTEND_SELECTION", delta: action.delta };
		case "swapAnchor":
			return { type: "SWAP_SELECTION_ANCHOR" };
		case "deleteSelection":
			return { type: "DELETE_SELECTION" };
		case "yankSelection":
			return { type: "YANK_SELECTION" };
		case "nextError":
		case "prevError":
			return null;
		case "insertBelow":
		case "insertAbove":
			return null;
	}
}

export function snapshotNotebookState(state: NotebookState): ParitySnapshot {
	return {
		activeIndex: state.activeIndex,
		draftText: state.draftText,
		commandLine: state.commandLine,
		commandHistory: [...state.commandHistory],
		mode: state.mode,
		selection:
			state.mode === "VISUAL"
				? { start: state.visualStart, end: state.visualEnd }
				: null,
		cells: state.cells.map((cell) => ({
			cellId: cell.cellId,
			collection: cell.collection,
			intentKind: cell.intentKind,
			rawInput: cell.rawInput,
			status: cell.status,
		})),
		undoDepth: state.undoStack.length,
		redoDepth: state.redoStack.length,
		preview: state.preview,
		sessionMode: state.sessionMode,
		message: state.message,
	};
}

export function createNotebookParityRunner(
	initial: NotebookState,
): ParityRunner {
	let state = structuredClone(initial);
	return {
		apply(action) {
			const notebookAction =
				action.type === "document"
					? documentToNotebookAction(action.action)
					: action.action;
			if (notebookAction) state = notebookReducer(state, notebookAction);
		},
		snapshot: () => snapshotNotebookState(state),
	};
}

export function runParitySequence(
	runner: ParityRunner,
	actions: ParityAction[],
): ParitySnapshot {
	for (const action of actions) runner.apply(action);
	return runner.snapshot();
}

export interface ParityComparison {
	equal: boolean;
	left: ParitySnapshot;
	right: ParitySnapshot;
	firstDifference?: string;
}

export function compareParity(
	left: ParityRunner,
	right: ParityRunner,
	actions: ParityAction[],
): ParityComparison {
	const leftSnapshot = runParitySequence(left, actions);
	const rightSnapshot = runParitySequence(right, actions);
	if (JSON.stringify(leftSnapshot) === JSON.stringify(rightSnapshot)) {
		return { equal: true, left: leftSnapshot, right: rightSnapshot };
	}

	for (const key of Object.keys(leftSnapshot) as Array<keyof ParitySnapshot>) {
		if (
			JSON.stringify(leftSnapshot[key]) !== JSON.stringify(rightSnapshot[key])
		) {
			return {
				equal: false,
				left: leftSnapshot,
				right: rightSnapshot,
				firstDifference: key,
			};
		}
	}
	return { equal: false, left: leftSnapshot, right: rightSnapshot };
}
