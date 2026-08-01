import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type {
	Cell,
	CellCollectionRef,
	CellIntentKind,
} from "@stateful-mcp/clinical/session/cell";
import type { CellInputSegment } from "@stateful-mcp/clinical/session/cell-input-segmentation";
import type { CompletionState } from "./completion-state";

export type CellEditorMode = "NORMAL" | "INSERT" | "COMMAND";

export interface CellSubmissionSegment extends CellInputSegment {
	cellId?: string;
	intentKind: CellIntentKind;
}

export interface CellSubmissionPlan {
	submissionId: string;
	collection: CellCollectionRef;
	segments: CellSubmissionSegment[];
}

export interface CellEditorHost {
	collection: CellCollectionRef;
	getCells(): Cell[];
	getCommandSuggestions(text: string): AutocompleteSuggestion[];
	planSubmission(text: string): CellSubmissionPlan;
	submit(plan: CellSubmissionPlan): Promise<void>;
	onUiCommand?(text: string): Promise<boolean>;
}

export interface CellEditorState {
	collection: CellCollectionRef;
	cells: Cell[];
	activeIndex: number;
	mode: CellEditorMode;
	draftText: string;
	completion: CompletionState;
	showHelp: boolean;
	error: string | null;
}

export type CellEditorAction =
	| { type: "SET_CELLS"; cells: Cell[] }
	| { type: "SET_ACTIVE_INDEX"; index: number }
	| { type: "ENTER_INSERT" }
	| { type: "ENTER_COMMAND" }
	| { type: "SET_DRAFT"; text: string }
	| { type: "INSERT_TEXT"; text: string }
	| { type: "BACKSPACE" }
	| { type: "NEWLINE" }
	| { type: "SET_COMPLETION"; completion: CompletionState }
	| { type: "SHOW_HELP"; show: boolean }
	| { type: "SET_ERROR"; error: string | null }
	| { type: "CANCEL" };

export function createCellEditorState(
	collection: CellCollectionRef,
	cells: Cell[] = [],
): CellEditorState {
	return {
		collection,
		cells,
		activeIndex: Math.max(0, cells.length - 1),
		mode: "NORMAL",
		draftText: "",
		completion: { status: "idle" },
		showHelp: false,
		error: null,
	};
}

export function reduceCellEditor(
	state: CellEditorState,
	action: CellEditorAction,
): CellEditorState {
	switch (action.type) {
		case "SET_CELLS":
			return {
				...state,
				cells: action.cells,
				activeIndex: Math.min(
					Math.max(0, action.cells.length - 1),
					state.activeIndex,
				),
			};
		case "SET_ACTIVE_INDEX":
			return {
				...state,
				activeIndex: Math.max(
					0,
					Math.min(action.index, Math.max(0, state.cells.length - 1)),
				),
			};
		case "ENTER_INSERT":
			return { ...state, mode: "INSERT", error: null };
		case "ENTER_COMMAND":
			return {
				...state,
				mode: "COMMAND",
				draftText: ":",
				completion: { status: "idle" },
			};
		case "SET_DRAFT":
			return { ...state, draftText: action.text, error: null };
		case "INSERT_TEXT":
			return {
				...state,
				draftText: state.draftText + action.text,
				error: null,
			};
		case "BACKSPACE":
			return { ...state, draftText: state.draftText.slice(0, -1) };
		case "NEWLINE":
			return { ...state, draftText: `${state.draftText}\n` };
		case "SET_COMPLETION":
			return { ...state, completion: action.completion };
		case "SHOW_HELP":
			return { ...state, showHelp: action.show };
		case "SET_ERROR":
			return { ...state, error: action.error };
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
