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

/** Editor state; domain truth remains in CellStore and StructuredCellService. */
export interface NotebookEditorState {
	cells: StructuredCell[];
	activeIndex: number;
	draftText: string;
	commandLine: string;
	commandHistory: string[];
	mode: NotebookEditorMode;
	runMode: NotebookRunMode;
	dirty: boolean;
	loading: boolean;
	message?: string;
	preview?: CellPreview;
	showHelp: boolean;
	visualStart: number;
	visualEnd: number;
	lastEditCellId: string | null;
}

export const INITIAL__NOTEBOOK_EDITOR_STATE: NotebookEditorState = {
	cells: [],
	activeIndex: 0,
	draftText: "",
	commandLine: "",
	commandHistory: [],
	mode: "NORMAL",
	runMode: "execute",
	dirty: false,
	loading: false,
	message: undefined,
	preview: undefined,
	showHelp: false,
	visualStart: 0,
	visualEnd: 0,
	lastEditCellId: null,
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
	| { type: "SET_ACTIVE_INDEX"; index: number }
	| { type: "SET_MESSAGE"; message?: string }
	| { type: "SET_SESSION_MODE"; mode: NotebookRunMode }
	| { type: "SET_LOADING"; loading: boolean }
	| { type: "CLEAR_PREVIEW" }
	| { type: "SET_PREVIEW"; preview?: CellPreview }
	| { type: "ENTER_INSERT_MODE" }
	| { type: "EXIT_INSERT_MODE" }
	| { type: "ENTER_COMMAND_MODE" }
	| { type: "EXIT_COMMAND_MODE" }
	| { type: "ENTER_MACRO_MODE" }
	| { type: "EXIT_MACRO_MODE" }
	| { type: "ENTER_VISUAL_MODE" }
	| { type: "EXIT_VISUAL_MODE" }
	| { type: "TYPE_CHAR"; char: string }
	| { type: "COMMAND_APPEND"; char: string }
	| { type: "COMMAND_BACKSPACE" }
	| { type: "COMMAND_SET"; text: string }
	| { type: "SET_MACRO_TEXT"; text: string }
	| { type: "BACKSPACE" }
	| { type: "COMMAND_HISTORY_PREV" }
	| { type: "COMMAND_HISTORY_NEXT" }
	| { type: "SET_ACTIVE"; index: number }
	| { type: "SET_CELLS"; cells: StructuredCell[] }
	| { type: "REPLACE_CELL"; cell: StructuredCell };

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
			? { ...state, commandLine: state.commandLine + text, dirty: true }
			: { ...state, draftText: state.draftText + text, dirty: true };

	switch (action.type) {
		case "set_cells":
		case "SET_CELLS":
			return {
				...state,
				cells: action.cells,
				activeIndex: clampIndex(state.activeIndex, action.cells.length),
			};
		case "replace_cell":
		case "REPLACE_CELL":
			return {
				...state,
				cells: state.cells.map((cell) =>
					cell.cellId === action.cell.cellId ? action.cell : cell,
				),
			};
		case "set_active":
		case "SET_ACTIVE_INDEX":
		case "SET_ACTIVE":
			return setActive(action.index);
		case "set_draft":
			return { ...state, draftText: action.text, dirty: true };
		case "set_command":
		case "COMMAND_SET":
			return { ...state, commandLine: action.text, dirty: true };
		case "append_text":
		case "TYPE_CHAR":
			return typeText(action.type === "append_text" ? action.text : action.char);
		case "COMMAND_APPEND":
			return { ...state, commandLine: state.commandLine + action.char, dirty: true };
		case "backspace":
		case "BACKSPACE":
			return state.mode === "COMMAND"
				? { ...state, commandLine: state.commandLine.slice(0, -1), dirty: true }
				: { ...state, draftText: state.draftText.slice(0, -1), dirty: true };
		case "COMMAND_BACKSPACE":
			return { ...state, commandLine: state.commandLine.slice(0, -1), dirty: true };
		case "set_mode":
			return setMode(action.mode);
		case "set_run_mode":
		case "SET_SESSION_MODE":
			return { ...state, runMode: action.mode };
		case "set_message":
		case "SET_MESSAGE":
			return { ...state, message: action.message };
		case "set_loading":
		case "SET_LOADING":
			return { ...state, loading: action.loading };
		case "set_preview":
		case "SET_PREVIEW":
			return { ...state, preview: action.preview };
		case "CLEAR_PREVIEW":
			return { ...state, preview: undefined };
		case "set_show_help":
			return { ...state, showHelp: action.show };
		case "set_visual_selection":
			return {
				...state,
				visualStart: action.start,
				visualEnd: action.end,
			};
		case "set_command_history":
			return { ...state, commandHistory: action.history };
		case "set_last_edit_cell":
			return { ...state, lastEditCellId: action.cellId };
		case "SET_MACRO_TEXT":
			return { ...state, draftText: action.text, dirty: true };
		case "COMMAND_HISTORY_PREV":
			return historyMove(state, -1);
		case "COMMAND_HISTORY_NEXT":
			return historyMove(state, 1);
		case "ENTER_INSERT_MODE":
			return setMode("INSERT");
		case "EXIT_INSERT_MODE":
			return setMode("NORMAL");
		case "ENTER_COMMAND_MODE":
			return setMode("COMMAND");
		case "EXIT_COMMAND_MODE":
			return { ...setMode("NORMAL"), commandLine: "" };
		case "ENTER_MACRO_MODE":
			return { ...setMode("MACRO"), draftText: "" };
		case "EXIT_MACRO_MODE":
			return { ...setMode("NORMAL"), draftText: "" };
		case "ENTER_VISUAL_MODE":
			return { ...setMode("VISUAL"), visualStart: state.activeIndex, visualEnd: state.activeIndex };
		case "EXIT_VISUAL_MODE":
			return setMode("NORMAL");
		case "mark_clean":
			return { ...state, dirty: false };
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
		(current < 0 ? (direction < 0 ? state.commandHistory.length : -1) : current) + direction,
		state.commandHistory.length,
	);
	return { ...state, commandLine: state.commandHistory[index] ?? "" };
}
