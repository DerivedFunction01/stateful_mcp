import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { CompletionState } from "./completion-state";

export type CellEditorMode = EditorMode;

export interface EditorKernelState {
	mode: CellEditorMode;
	draftText: string;
	completion: CompletionState;
	error: string | null;
	showHelp: boolean;
}

export type EditorAction =
	| { type: "ENTER_INSERT" }
	| { type: "ENTER_COMMAND" }
	| { type: "ENTER_MACRO" }
	| { type: "SUBMIT_MACRO" }
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
	| { type: "COMMIT_COMPLETION"; line: string };

export function createEditorKernelState(): EditorKernelState {
	return {
		mode: "NORMAL",
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
			return { ...state, mode: "INSERT", error: null };
		case "ENTER_COMMAND":
			return {
				...state,
				mode: "COMMAND",
				draftText: ":",
				completion: { status: "idle" },
			};
		case "ENTER_MACRO":
			return {
				...state,
				mode: "MACRO",
				draftText: "^",
				completion: { status: "idle" },
				error: null,
			};
		case "SUBMIT_MACRO":
			return { ...state, mode: "NORMAL", completion: { status: "idle" } };
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
