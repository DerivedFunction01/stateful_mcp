import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { CompletionState } from "./completion-state";

export type CellEditorMode = EditorMode;

/** Right-hand sidebar activity bar views. */
export type SidebarViewTab =
	| "branches"
	| "slots"
	| "history"
	| "patient"
	| "soap";

export interface EditorKernelState {
	mode: CellEditorMode;
	commandKind?: "macro" | "direct" | "variable";
	draftText: string;
	completion: CompletionState;
	error: string | null;
	showHelp: boolean;
	visualStart?: number;
	visualEnd?: number;
}

export type EditorAction =
	| { type: "ENTER_INSERT" }
	| { type: "ENTER_COMMAND" }
	| { type: "ENTER_MACRO" }
	| { type: "SUBMIT_MACRO" }
	| { type: "UNLOCK_MACRO" }
	| { type: "LOCK_MACRO" }
	| { type: "MOVE_CURSOR"; delta: -1 | 1 }
	| { type: "CURSOR_HOME" }
	| { type: "CURSOR_END" }
	| { type: "INSERT_TEXT"; text: string }
	| { type: "NEWLINE" }
	| { type: "BACKSPACE" }
	| { type: "SET_DRAFT"; text: string }
	| { type: "SET_COMPLETION"; completion: CompletionState }
	| { type: "SHOW_HELP"; show: boolean }
	| { type: "SET_ERROR"; error: string | null }
	| { type: "HISTORY_PREV" }
	| { type: "HISTORY_NEXT" }
	| { type: "CANCEL" }
	| { type: "SEARCH" }
	| { type: "OPEN_HISTORY" }
	| { type: "TOGGLE_SIDEBAR" }
	| { type: "NEXT_WORKSPACE_TAB" }
	| { type: "PREVIOUS_WORKSPACE_TAB" }
	| { type: "NEXT_ASSESSMENT_TAB" }
	| { type: "PREVIOUS_ASSESSMENT_TAB" }
	| { type: "ENTER_VISUAL" }
	| { type: "EXTEND_VISUAL"; delta: -1 | 1 }
	| { type: "DELETE_VISUAL" }
	| { type: "YANK_VISUAL" }
	| { type: "COMMIT_COMPLETION"; line: string }
	| { type: "OPEN_SCRATCHPAD" }
	| { type: "SET_SIDEBAR_TAB"; tab: SidebarViewTab };

export function createEditorKernelState(): EditorKernelState {
	return {
		mode: "NORMAL",
		commandKind: "direct",
		draftText: "",
		completion: { status: "idle" },
		error: null,
		showHelp: false,
	};
}

export function reduceEditorKernel(
	state: EditorKernelState,
	action: EditorAction,
): EditorKernelState {
	switch (action.type) {
		case "ENTER_INSERT":
			return { ...state, mode: "INSERT", commandKind: "direct", error: null };
		case "ENTER_COMMAND":
			return {
				...state,
				mode: "COMMAND",
				commandKind: "direct",
				draftText: ":",
				completion: { status: "idle" },
			};
		case "ENTER_MACRO":
			return {
				...state,
				mode: "MACRO",
				commandKind: "macro",
				draftText: "^",
				completion: { status: "idle" },
				error: null,
			};
		case "SUBMIT_MACRO":
			return {
				...state,
				mode: "NORMAL",
				commandKind: "direct",
				completion: { status: "idle" },
			};
		case "UNLOCK_MACRO":
			return state;
		case "LOCK_MACRO":
			return state;
		case "MOVE_CURSOR":
		case "CURSOR_HOME":
		case "CURSOR_END":
			return state;
		case "INSERT_TEXT":
			return {
				...state,
				draftText: state.draftText + action.text,
				completion: { status: "idle" },
				error: null,
			};
		case "NEWLINE":
			return {
				...state,
				draftText: `${state.draftText}\n`,
				completion: { status: "idle" },
			};
		case "BACKSPACE":
			return {
				...state,
				draftText: state.draftText.slice(0, -1),
				completion: { status: "idle" },
			};
		case "SET_DRAFT":
			return {
				...state,
				draftText: action.text,
				completion: { status: "idle" },
				error: null,
			};
		case "SET_COMPLETION":
			return { ...state, completion: action.completion };
		case "COMMIT_COMPLETION":
			return {
				...state,
				draftText: action.line,
				completion: { status: "idle" },
			};
		case "SHOW_HELP":
			return { ...state, showHelp: action.show };
		case "SET_ERROR":
			return { ...state, error: action.error };
		case "HISTORY_PREV":
		case "HISTORY_NEXT":
			return state;
		case "SEARCH":
		case "OPEN_HISTORY":
		case "TOGGLE_SIDEBAR":
		case "NEXT_WORKSPACE_TAB":
		case "PREVIOUS_WORKSPACE_TAB":
		case "NEXT_ASSESSMENT_TAB":
		case "PREVIOUS_ASSESSMENT_TAB":
		case "OPEN_SCRATCHPAD":
		case "SET_SIDEBAR_TAB":
			return state;
		case "ENTER_VISUAL":
			return { ...state, mode: "VISUAL" };
		case "EXTEND_VISUAL":
		case "DELETE_VISUAL":
		case "YANK_VISUAL":
			return state;
		case "CANCEL":
			return {
				...state,
				mode: "NORMAL",
				draftText: "",
				completion: { status: "idle" },
				error: null,
			};
	}
}

export function currentCommandLine(draftText: string): string {
	const line = draftText.split("\n").at(-1)?.trimStart() ?? "";
	return line.startsWith(":") ? line : "";
}

export function replaceCurrentLine(draftText: string, line: string): string {
	const lines = draftText.split("\n");
	lines[lines.length - 1] = line;
	return lines.join("\n");
}
