import type { CellPreview } from "../cells/cell-service-types";
import type { StructuredCell } from "../cells/structured-cell";

export const NOTEBOOK_STATE = [
	"NORMAL",
	"INSERT",
	"COMMAND",
	"MACRO",
	"VISUAL",
] as const;

export type NotebookEditorMode = (typeof NOTEBOOK_STATE)[number];
export type NotebookRunMode = "preview" | "execute";

export interface NotebookYankBuffer {
	sourceCellIds: string[];
	snapshots: StructuredCell[];
	copiedAt: string;
}

export type DeleteEligibility =
	| { eligible: true }
	| {
			eligible: false;
			reason: "committed" | "locked" | "deleted" | "pending_commit" | "unknown";
	  };

export interface NotebookEditorUndoSnapshot {
	cellOrder: string[];
	activeIndex: number;
	draftText: string;
	commandHistory: string[];
	authoredRevision: number;
	restorableDrafts: StructuredCell[];
}

/** Editor state; domain truth remains in CellStore and StructuredCellService. */
export interface NotebookEditorState {
	cells: StructuredCell[];
	activeIndex: number;
	draftText: string;
	commandLine: string;
	commandHistory: string[];
	commandHistoryIndex: number;
	mode: NotebookEditorMode;
	runMode: NotebookRunMode;
	authoredRevision: number;
	persistedAuthoredRevision: number;
	loading: boolean;
	message?: string;
	preview?: CellPreview;
	showHelp: boolean;
	visualStart: number;
	visualEnd: number;
	lastEditCellId: string | null;
	undoStack: NotebookEditorUndoSnapshot[];
	redoStack: NotebookEditorUndoSnapshot[];
	yankBuffer: NotebookYankBuffer | null;
}

export const INITIAL__NOTEBOOK_EDITOR_STATE: NotebookEditorState = {
	cells: [],
	activeIndex: 0,
	draftText: "",
	commandLine: "",
	commandHistory: [],
	commandHistoryIndex: -1,
	mode: "NORMAL",
	runMode: "execute",
	authoredRevision: 0,
	persistedAuthoredRevision: 0,
	loading: false,
	message: undefined,
	preview: undefined,
	showHelp: false,
	visualStart: 0,
	visualEnd: 0,
	lastEditCellId: null,
	undoStack: [],
	redoStack: [],
	yankBuffer: null,
};

export type NotebookEditorAction =
	| { type: "set_cells"; cells: StructuredCell[] }
	| { type: "replace_cell"; cell: StructuredCell }
	| { type: "set_active"; index: number }
	| { type: "set_draft"; text: string }
	| { type: "set_command"; text: string }
	| { type: "append_text"; text: string }
	| { type: "backspace" }
	| { type: "set_mode"; mode: NotebookEditorMode }
	| { type: "set_run_mode"; mode: NotebookRunMode }
	| { type: "set_message"; message?: string }
	| { type: "set_loading"; loading: boolean }
	| { type: "set_preview"; preview?: CellPreview }
	| { type: "set_show_help"; show: boolean }
	| { type: "set_visual_selection"; start: number; end: number }
	| { type: "set_command_history"; history: string[] }
	| { type: "set_last_edit_cell"; cellId: string | null }
	| { type: "mark_clean" }
	| { type: "remove_cells"; cellIds: string[] }
	| { type: "yank_cells"; cellIds: string[]; snapshots: StructuredCell[] }
	| { type: "paste_cells"; cells: StructuredCell[]; insertIndex: number }
	| { type: "set_persisted_revision"; revision: number }
	| { type: "move_cell"; cellId: string; targetIndex: number }
	| { type: "hydrate_snapshot"; cells: StructuredCell[]; activeIndex: number; draftText: string; commandHistory: string[]; mode: NotebookEditorMode }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "clear_yank_buffer" }
	| { type: "COMMAND_HISTORY_PREV" }
	| { type: "COMMAND_HISTORY_NEXT" };

export function reduceNotebookEditor(
	state: NotebookEditorState,
	action: NotebookEditorAction,
): NotebookEditorState {
	const setActive = (index: number): NotebookEditorState => ({
		...state,
		activeIndex: clampIndex(index, state.cells.length),
	});
	const setMode = (mode: NotebookEditorMode): NotebookEditorState => ({
		...state,
		mode,
	});
	const typeText = (text: string): NotebookEditorState =>
		state.mode === "COMMAND"
			? {
					...state,
					commandLine: state.commandLine + text,
					authoredRevision: state.authoredRevision + 1,
				}
			: {
					...state,
					draftText: state.draftText + text,
					authoredRevision: state.authoredRevision + 1,
				};

	const withSnapshot = (
		next: NotebookEditorState,
		snapshot: NotebookEditorUndoSnapshot,
	): NotebookEditorState => ({
		...next,
		undoStack: [...state.undoStack, snapshot],
		redoStack: [],
	});

	const reconstructCells = (
		order: string[],
		restorableDrafts: StructuredCell[],
	): StructuredCell[] => {
		const byId = new Map<string, StructuredCell>();
		for (const c of state.cells) byId.set(c.cellId, c);
		for (const c of restorableDrafts) byId.set(c.cellId, c);
		const result: StructuredCell[] = [];
		const seen = new Set<string>();
		for (const id of order) {
			if (!seen.has(id) && byId.has(id)) {
				result.push(byId.get(id)!);
				seen.add(id);
			}
		}
		return result;
	};

	switch (action.type) {
		case "set_cells":
			return {
				...state,
				cells: action.cells,
				activeIndex: clampIndex(state.activeIndex, action.cells.length),
			};
		case "replace_cell":
			return {
				...state,
				cells: state.cells.map((cell) =>
					cell.cellId === action.cell.cellId ? action.cell : cell,
				),
			};
		case "set_active":
			return setActive(action.index);
		case "set_draft":
			return {
				...state,
				draftText: action.text,
				authoredRevision: state.authoredRevision + 1,
			};
		case "set_command":
			return {
				...state,
				commandLine: action.text,
				authoredRevision: state.authoredRevision + 1,
			};
		case "append_text":
			return typeText(action.text);
		case "backspace":
			return state.mode === "COMMAND"
				? {
						...state,
						commandLine: state.commandLine.slice(0, -1),
						authoredRevision: state.authoredRevision + 1,
					}
				: {
						...state,
						draftText: state.draftText.slice(0, -1),
						authoredRevision: state.authoredRevision + 1,
					};
		case "set_mode":
			return setMode(action.mode);
		case "set_run_mode":
			return { ...state, runMode: action.mode };
		case "set_message":
			return { ...state, message: action.message };
		case "set_loading":
			return { ...state, loading: action.loading };
		case "set_preview":
			return { ...state, preview: action.preview };
		case "set_show_help":
			return { ...state, showHelp: action.show };
		case "set_visual_selection":
			return {
				...state,
				visualStart: clampIndex(action.start, state.cells.length),
				visualEnd: clampIndex(action.end, state.cells.length),
			};
		case "set_command_history":
			return { ...state, commandHistory: action.history };
		case "set_last_edit_cell":
			return { ...state, lastEditCellId: action.cellId };
		case "mark_clean":
			return { ...state, persistedAuthoredRevision: state.authoredRevision };
		case "remove_cells": {
			const nextCells = state.cells.filter(
				(c) => !action.cellIds.includes(c.cellId),
			);
			const snapshot: NotebookEditorUndoSnapshot = {
				cellOrder: state.cells.map((c) => c.cellId),
				activeIndex: state.activeIndex,
				draftText: state.draftText,
				commandHistory: state.commandHistory,
				authoredRevision: state.authoredRevision,
				restorableDrafts: state.cells
					.filter((c) => action.cellIds.includes(c.cellId))
					.map((c) => clearExecutionState(c)),
			};
			return withSnapshot(
				{
					...state,
					cells: nextCells,
					activeIndex: clampIndex(state.activeIndex, nextCells.length),
					authoredRevision: state.authoredRevision + 1,
				},
				snapshot,
			);
		}
		case "yank_cells": {
			const snapshots = state.cells
				.filter((c) => action.cellIds.includes(c.cellId))
				.map((c) => clearExecutionState(c));
			return {
				...state,
				yankBuffer: {
					sourceCellIds: action.cellIds,
					snapshots,
					copiedAt: new Date().toISOString(),
				},
			};
		}
		case "paste_cells": {
			const nextCells = [
				...state.cells.slice(0, action.insertIndex),
				...action.cells,
				...state.cells.slice(action.insertIndex),
			];
			const snapshot: NotebookEditorUndoSnapshot = {
				cellOrder: state.cells.map((c) => c.cellId),
				activeIndex: state.activeIndex,
				draftText: state.draftText,
				commandHistory: state.commandHistory,
				authoredRevision: state.authoredRevision,
				restorableDrafts: action.cells,
			};
			return withSnapshot(
				{
					...state,
					cells: nextCells,
					activeIndex: clampIndex(action.insertIndex, nextCells.length),
					authoredRevision: state.authoredRevision + 1,
				},
				snapshot,
			);
		}
		case "set_persisted_revision":
			return { ...state, persistedAuthoredRevision: action.revision };
		case "move_cell": {
			const fromIndex = state.cells.findIndex(
				(c) => c.cellId === action.cellId,
			);
			if (fromIndex < 0) return state;
			const nextCells = [...state.cells];
			const moved = nextCells.splice(fromIndex, 1)[0];
			if (!moved) return state;
			const toIndex = Math.max(
				0,
				Math.min(action.targetIndex, nextCells.length),
			);
			nextCells.splice(toIndex, 0, moved);
			const snapshot: NotebookEditorUndoSnapshot = {
				cellOrder: nextCells.map((c) => c.cellId),
				activeIndex:
					state.activeIndex === fromIndex
						? toIndex
						: state.activeIndex,
				draftText: state.draftText,
				commandHistory: state.commandHistory,
				authoredRevision: state.authoredRevision,
				restorableDrafts: [],
			};
			return withSnapshot(
				{
					...state,
					cells: nextCells,
					activeIndex: clampIndex(
						state.activeIndex,
						nextCells.length,
					),
					authoredRevision: state.authoredRevision + 1,
				},
				snapshot,
			);
		}
		case "hydrate_snapshot":
			return {
				...state,
				cells: action.cells,
				activeIndex: clampIndex(action.activeIndex, action.cells.length),
				draftText: action.draftText,
				commandHistory: action.commandHistory,
				mode: action.mode,
				persistedAuthoredRevision: state.authoredRevision,
				loading: false,
			};
		case "undo": {
			if (state.undoStack.length === 0) return state;
			const previous = state.undoStack[state.undoStack.length - 1]!;
			const currentSnapshot: NotebookEditorUndoSnapshot = {
				cellOrder: state.cells.map((c) => c.cellId),
				activeIndex: state.activeIndex,
				draftText: state.draftText,
				commandHistory: state.commandHistory,
				authoredRevision: state.authoredRevision,
				restorableDrafts: [],
			};
			return {
				...state,
				cells: reconstructCells(previous.cellOrder, previous.restorableDrafts),
				activeIndex: previous.activeIndex,
				draftText: previous.draftText,
				commandHistory: previous.commandHistory,
				undoStack: state.undoStack.slice(0, -1),
				redoStack: [...state.redoStack, currentSnapshot],
				authoredRevision: previous.authoredRevision,
			};
		}
		case "redo": {
			if (state.redoStack.length === 0) return state;
			const next = state.redoStack[state.redoStack.length - 1]!;
			const currentSnapshot: NotebookEditorUndoSnapshot = {
				cellOrder: state.cells.map((c) => c.cellId),
				activeIndex: state.activeIndex,
				draftText: state.draftText,
				commandHistory: state.commandHistory,
				authoredRevision: state.authoredRevision,
				restorableDrafts: [],
			};
			return {
				...state,
				cells: reconstructCells(next.cellOrder, next.restorableDrafts),
				activeIndex: next.activeIndex,
				draftText: next.draftText,
				commandHistory: next.commandHistory,
				undoStack: [...state.undoStack, currentSnapshot],
				redoStack: state.redoStack.slice(0, -1),
				authoredRevision: next.authoredRevision,
			};
		}
		case "clear_yank_buffer":
			return { ...state, yankBuffer: null };
		case "COMMAND_HISTORY_PREV":
			return historyMove(state, -1);
		case "COMMAND_HISTORY_NEXT":
			return historyMove(state, 1);
	}
}

function clampIndex(index: number, length: number): number {
	return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function historyMove(
	state: NotebookEditorState,
	direction: -1 | 1,
): NotebookEditorState {
	if (state.commandHistory.length === 0) return state;
	const current = state.commandHistory.indexOf(state.commandLine);
	const index = clampIndex(
		(current < 0
			? direction < 0
				? state.commandHistory.length
				: -1
			: current) + direction,
		state.commandHistory.length,
	);
	return { ...state, commandLine: state.commandHistory[index] ?? "" };
}

function clearExecutionState(cell: StructuredCell): StructuredCell {
	return {
		...cell,
		execution: {
			previewId: undefined,
			transactionId: undefined,
			planFingerprint: undefined,
			committedAt: undefined,
			generatedCellIds: undefined,
			resultRefs: undefined,
		},
	};
}
