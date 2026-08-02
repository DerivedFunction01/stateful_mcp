import type { Cell } from "../session/cell";
import type { EditorMode } from "../session/editor-mode";
import type { PreviewCandidate } from "../session/preview-candidate";

export type ExecutionPolicy = "execute" | "preview";

export interface UndoEntry {
	cells: Cell[];
	activeIndex: number;
	draftText: string;
	authoredRevision: number;
}

export interface NotebookState {
	cells: Cell[];
	activeIndex: number;
	mode: EditorMode;
	draftText: string;
	lastEditCellId: string | null;
	undoStack: UndoEntry[];
	redoStack: UndoEntry[];
	dirty: boolean;
	authoredRevision: number;
	persistedAuthoredRevision: number;
	sessionMode: ExecutionPolicy;
	preview: PreviewCandidate | null;
	commandLine: string;
	commandHistory: string[];
	commandHistoryIndex: number;
	commandFrequency: Record<string, number>;
	yankBuffer: Cell[];
	searchTerm: string;
	showHelp: boolean;
	showWorkspace: boolean;
	showCellInfo: boolean;
	cellInfoIndex: number;
	defaultSection: string;
	defaultSchema: string | null;
	visualStart: number;
	visualEnd: number;
	message: string | null;
}

export type NotebookAction =
	| { type: "SET_CELLS"; cells: Cell[] }
	| { type: "SET_DRAFT_TEXT"; text: string }
	| { type: "MOVE_CURSOR"; delta: number }
	| { type: "SET_ACTIVE_INDEX"; index: number }
	| { type: "ENTER_INSERT_MODE" }
	| { type: "EXIT_INSERT_MODE" }
	| { type: "TYPE_CHAR"; char: string }
	| { type: "BACKSPACE" }
	| { type: "COMMIT_CELL" }
	| { type: "INSERT_CELL"; cell: Cell; position: number }
	| { type: "DELETE_ACTIVE_CELL" }
	| { type: "SET_CELL_TEXT"; cellId: string; text: string }
	| { type: "UPDATE_CELL"; cellId: string; updater: (c: Cell) => Cell }
	| { type: "UNDO" }
	| { type: "REDO" }
	| { type: "SET_SESSION_MODE"; mode: ExecutionPolicy }
	| { type: "SET_PREVIEW"; preview: PreviewCandidate }
	| { type: "CLEAR_PREVIEW" }
	| { type: "ENTER_COMMAND_MODE" }
	| { type: "EXIT_COMMAND_MODE" }
	| { type: "COMMAND_APPEND"; char: string }
	| { type: "COMMAND_BACKSPACE" }
	| { type: "COMMAND_SUBMIT"; line: string }
	| { type: "COMMAND_HISTORY_PREV" }
	| { type: "COMMAND_HISTORY_NEXT" }
	| { type: "YANK_CELL" }
	| { type: "PASTE_CELL" }
	| { type: "SET_SEARCH_TERM"; term: string }
	| { type: "TOGGLE_HELP" }
	| { type: "TOGGLE_WORKSPACE" }
	| { type: "TOGGLE_CELL_INFO"; cellIndex: number }
	| { type: "ENTER_VISUAL_MODE" }
	| { type: "EXIT_VISUAL_MODE" }
	| { type: "EXTEND_SELECTION"; delta: number }
	| { type: "SWAP_SELECTION_ANCHOR" }
	| { type: "DELETE_SELECTION" }
	| { type: "YANK_SELECTION" }
	| { type: "SET_MESSAGE"; message: string | null }
	| { type: "COMMAND_SET"; text: string }
	| { type: "SET_DEFAULT_INSERT"; section: string; schema: string | null }
	| { type: "SET_PERSISTED_REVISION"; revision: number };

function snapshot(state: NotebookState): UndoEntry {
	return {
		cells: state.cells.map((c) => structuredClone(c)),
		activeIndex: state.activeIndex,
		draftText: state.draftText,
		authoredRevision: state.authoredRevision,
	};
}

function pushUndo(state: NotebookState): {
	undoStack: UndoEntry[];
	redoStack: UndoEntry[];
} {
	return {
		undoStack: [...state.undoStack.slice(-49), snapshot(state)],
		redoStack: [],
	};
}

function clampIndex(index: number, max: number): number {
	return Math.max(0, Math.min(index, Math.max(0, max - 1)));
}

function clamp(index: number, min: number, max: number): number {
	return Math.max(min, Math.min(index, max));
}

export const INITIAL_NOTEBOOK_STATE: NotebookState = {
	cells: [],
	activeIndex: 0,
	mode: "NORMAL",
	draftText: "",
	lastEditCellId: null,
	undoStack: [],
	redoStack: [],
	dirty: false,
	authoredRevision: 0,
	persistedAuthoredRevision: 0,
	sessionMode: "execute",
	preview: null,
	commandLine: "",
	commandHistory: [],
	commandHistoryIndex: -1,
	commandFrequency: {},
	yankBuffer: [],
	searchTerm: "",
	showHelp: false,
	showWorkspace: false,
	showCellInfo: false,
	cellInfoIndex: 0,
	defaultSection: "subjective",
	defaultSchema: null,
	visualStart: 0,
	visualEnd: 0,
	message: null,
};

export function rawNotebookReducer(
	state: NotebookState,
	action: NotebookAction,
): NotebookState {
	switch (action.type) {
		case "SET_CELLS":
			return { ...state, cells: action.cells };

		case "SET_DRAFT_TEXT": {
			const activeCell = state.cells[state.activeIndex];
			return {
				...state,
				draftText: action.text,
				mode: "INSERT",
				lastEditCellId: activeCell?.cellId ?? state.lastEditCellId,
			};
		}

		case "MOVE_CURSOR": {
			const newIdx = clampIndex(
				state.activeIndex + action.delta,
				state.cells.length,
			);
			return { ...state, activeIndex: newIdx };
		}

		case "SET_ACTIVE_INDEX":
			return { ...state, activeIndex: action.index };

		case "ENTER_INSERT_MODE": {
			const cell = state.cells[state.activeIndex];
			if (!cell) return state;
			const u = pushUndo(state);
			return {
				...state,
				mode: "INSERT",
				draftText: cell.rawInput,
				lastEditCellId: cell.cellId,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "EXIT_INSERT_MODE": {
			const u = pushUndo(state);
			const cells = state.cells.map((c) =>
				c.cellId === state.lastEditCellId
					? {
							...c,
							rawInput: state.draftText,
							updatedAt: new Date().toISOString(),
						}
					: c,
			);
			return {
				...state,
				mode: "NORMAL",
				cells,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "TYPE_CHAR":
			return { ...state, draftText: state.draftText + action.char };

		case "BACKSPACE":
			return { ...state, draftText: state.draftText.slice(0, -1) };

		case "COMMIT_CELL": {
			const u = pushUndo(state);
			const cells = state.cells.map((c) =>
				c.cellId === state.lastEditCellId
					? {
							...c,
							rawInput: state.draftText,
							updatedAt: new Date().toISOString(),
						}
					: c,
			);
			return {
				...state,
				mode: "NORMAL",
				cells,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "INSERT_CELL": {
			const u = pushUndo(state);
			const cells = [...state.cells];
			const insertAt = Math.min(action.position, cells.length);
			cells.splice(insertAt, 0, action.cell);
			return {
				...state,
				cells,
				activeIndex: insertAt,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "DELETE_ACTIVE_CELL": {
			if (state.cells.length === 0) return state;
			const u = pushUndo(state);
			const cells = state.cells.filter((_, i) => i !== state.activeIndex);
			const newIndex = Math.min(
				state.activeIndex,
				Math.max(0, cells.length - 1),
			);
			return {
				...state,
				cells,
				activeIndex: newIndex,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "SET_CELL_TEXT": {
			const cells = state.cells.map((c) =>
				c.cellId === action.cellId ? { ...c, rawInput: action.text } : c,
			);
			return { ...state, cells };
		}

		case "UPDATE_CELL": {
			const cells = state.cells.map((c) =>
				c.cellId === action.cellId ? action.updater(c) : c,
			);
			return { ...state, cells };
		}

		case "UNDO": {
			if (state.undoStack.length === 0) return state;
			const prev = state.undoStack[state.undoStack.length - 1]!;
			return {
				...state,
				cells: prev.cells,
				activeIndex: prev.activeIndex,
				draftText: prev.draftText,
				authoredRevision: prev.authoredRevision,
				mode: "NORMAL",
				preview: null,
				undoStack: state.undoStack.slice(0, -1),
				redoStack: [...state.redoStack, snapshot(state)],
			};
		}

		case "REDO": {
			if (state.redoStack.length === 0) return state;
			const next = state.redoStack[state.redoStack.length - 1]!;
			return {
				...state,
				cells: next.cells,
				activeIndex: next.activeIndex,
				draftText: next.draftText,
				authoredRevision: next.authoredRevision,
				mode: "NORMAL",
				preview: null,
				undoStack: [...state.undoStack, snapshot(state)],
				redoStack: state.redoStack.slice(0, -1),
			};
		}

		case "SET_SESSION_MODE":
			return { ...state, sessionMode: action.mode };

		case "SET_PREVIEW":
			return { ...state, preview: action.preview };

		case "CLEAR_PREVIEW":
			return { ...state, preview: null };

		case "ENTER_COMMAND_MODE":
			return {
				...state,
				mode: "COMMAND",
				commandLine: ":",
				commandHistoryIndex: -1,
			};

		case "EXIT_COMMAND_MODE":
			return { ...state, mode: "NORMAL", commandLine: "" };

		case "COMMAND_APPEND":
			return { ...state, commandLine: state.commandLine + action.char };

		case "COMMAND_BACKSPACE": {
			if (state.commandLine.length <= 1)
				return { ...state, mode: "NORMAL", commandLine: "" };
			return { ...state, commandLine: state.commandLine.slice(0, -1) };
		}

		case "COMMAND_SUBMIT": {
			const line = action.line;
			if (!line.slice(1).trim())
				return { ...state, mode: "NORMAL", commandLine: "" };
			const history = [
				line,
				...state.commandHistory.filter((h) => h !== line),
			].slice(0, 50);
			return {
				...state,
				mode: "NORMAL",
				commandLine: "",
				commandHistory: history,
				commandHistoryIndex: -1,
				commandFrequency: {
					...state.commandFrequency,
					[line]: (state.commandFrequency[line] ?? 0) + 1,
				},
			};
		}

		case "COMMAND_HISTORY_PREV": {
			if (state.commandHistory.length === 0) return state;
			const newIdx =
				state.commandHistoryIndex < state.commandHistory.length - 1
					? state.commandHistoryIndex + 1
					: state.commandHistoryIndex;
			return {
				...state,
				commandLine: state.commandHistory[newIdx] ?? ":",
				commandHistoryIndex: newIdx,
			};
		}

		case "COMMAND_HISTORY_NEXT": {
			if (state.commandHistoryIndex <= 0)
				return { ...state, commandLine: ":", commandHistoryIndex: -1 };
			const newIdx = state.commandHistoryIndex - 1;
			return {
				...state,
				commandLine: state.commandHistory[newIdx] ?? ":",
				commandHistoryIndex: newIdx,
			};
		}

		case "YANK_CELL": {
			const cell = state.cells[state.activeIndex];
			if (!cell) return state;
			return { ...state, yankBuffer: [structuredClone(cell)] };
		}

		case "PASTE_CELL": {
			if (state.yankBuffer.length === 0) return state;
			const u = pushUndo(state);
			const cells = [...state.cells];
			const insertAt = Math.min(state.activeIndex + 1, cells.length);
			const pasted = state.yankBuffer.map((c) => {
				const clone = structuredClone(c);
				clone.cellId = `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				return clone;
			});
			cells.splice(insertAt, 0, ...pasted);
			return {
				...state,
				cells,
				activeIndex: insertAt,
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "SET_SEARCH_TERM":
			return { ...state, searchTerm: action.term };

		case "TOGGLE_HELP":
			return { ...state, showHelp: !state.showHelp };

		case "TOGGLE_WORKSPACE":
			return { ...state, showWorkspace: !state.showWorkspace };

		case "TOGGLE_CELL_INFO":
			return {
				...state,
				showCellInfo: !state.showCellInfo,
				cellInfoIndex: action.cellIndex,
			};

		case "ENTER_VISUAL_MODE": {
			return {
				...state,
				mode: "VISUAL",
				visualStart: state.activeIndex,
				visualEnd: state.activeIndex,
			};
		}

		case "EXIT_VISUAL_MODE": {
			return {
				...state,
				mode: "NORMAL",
			};
		}

		case "EXTEND_SELECTION": {
			return {
				...state,
				visualEnd: clampIndex(
					state.visualEnd + action.delta,
					state.cells.length,
				),
				activeIndex: clampIndex(
					state.activeIndex + action.delta,
					state.cells.length,
				),
			};
		}

		case "SWAP_SELECTION_ANCHOR": {
			return {
				...state,
				activeIndex: state.visualStart,
				visualStart: state.activeIndex,
				visualEnd: state.visualStart,
			};
		}

		case "DELETE_SELECTION": {
			const lo = clamp(
				Math.min(state.visualStart, state.visualEnd),
				0,
				state.cells.length - 1,
			);
			const hi = clamp(
				Math.max(state.visualStart, state.visualEnd),
				0,
				state.cells.length - 1,
			);
			const count = hi - lo + 1;
			if (count <= 0) return state;
			const u = pushUndo(state);
			const cells = state.cells.filter((_, i) => i < lo || i > hi);
			const newIndex = Math.min(lo, Math.max(0, cells.length - 1));
			return {
				...state,
				cells,
				activeIndex: newIndex,
				mode: "NORMAL",
				undoStack: u.undoStack,
				redoStack: u.redoStack,
			};
		}

		case "YANK_SELECTION": {
			const lo = Math.min(state.visualStart, state.visualEnd);
			const hi = Math.max(state.visualStart, state.visualEnd);
			const yanked = state.cells
				.slice(lo, hi + 1)
				.map((c) => structuredClone(c));
			return { ...state, yankBuffer: yanked, mode: "NORMAL" };
		}

		case "SET_MESSAGE":
			return { ...state, message: action.message };

		case "COMMAND_SET":
			return { ...state, commandLine: action.text };

		case "SET_DEFAULT_INSERT":
			return {
				...state,
				defaultSection: action.section,
				defaultSchema: action.schema,
			};

		case "SET_PERSISTED_REVISION":
			return {
				...state,
				persistedAuthoredRevision: action.revision,
			};

		default:
			return state;
	}
}

export function notebookReducer(
	state: NotebookState,
	action: NotebookAction,
): NotebookState {
	let nextState = rawNotebookReducer(state, action);

	// Determine if the action should increment authoredRevision
	let incrementRevision = false;
	switch (action.type) {
		case "INSERT_CELL":
		case "DELETE_ACTIVE_CELL":
		case "PASTE_CELL":
		case "DELETE_SELECTION":
		case "SET_DRAFT_TEXT":
			incrementRevision = true;
			break;
		case "EXIT_INSERT_MODE":
		case "COMMIT_CELL":
			// Draft-text commits
			incrementRevision = true;
			break;
		case "SET_CELL_TEXT": {
			const cellBefore = state.cells.find((c) => c.cellId === action.cellId);
			if (!cellBefore || cellBefore.rawInput !== action.text) {
				incrementRevision = true;
			}
			break;
		}
		case "UPDATE_CELL": {
			const cellBefore = state.cells.find((c) => c.cellId === action.cellId);
			const cellAfter = nextState.cells.find((c) => c.cellId === action.cellId);
			if (cellBefore && cellAfter && cellBefore.rawInput !== cellAfter.rawInput) {
				incrementRevision = true;
			}
			break;
		}
	}

	if (incrementRevision) {
		nextState = {
			...nextState,
			authoredRevision: nextState.authoredRevision + 1,
		};
	}

	// Compute dirty derived state
	nextState = {
		...nextState,
		dirty: nextState.authoredRevision !== nextState.persistedAuthoredRevision,
	};

	return nextState;
}
