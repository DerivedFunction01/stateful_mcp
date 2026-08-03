import type { StructuredCell } from "../cells/structured-cell";

/** Editor-neutral V2 notebook state; domain truth remains in CellStore. */
export interface V2NotebookEditorState {
	cells: StructuredCell[];
	activeIndex: number;
	draftText: string;
	commandLine: string;
	commandHistory: string[];
	mode: "NORMAL" | "INSERT" | "COMMAND" | "MACRO" | "VISUAL";
	dirty: boolean;
	message?: string;
}

export const INITIAL_V2_NOTEBOOK_EDITOR_STATE: V2NotebookEditorState = {
	cells: [],
	activeIndex: 0,
	draftText: "",
	commandLine: "",
	commandHistory: [],
	mode: "NORMAL",
	dirty: false,
};

export type V2NotebookEditorAction =
	| { type: "set_cells"; cells: StructuredCell[] }
	| { type: "set_active"; index: number }
	| { type: "set_draft"; text: string }
	| { type: "set_command"; text: string }
	| { type: "set_mode"; mode: V2NotebookEditorState["mode"] }
	| { type: "set_message"; message?: string }
	| { type: "mark_clean" };

export function reduceV2NotebookEditor(
	state: V2NotebookEditorState,
	action: V2NotebookEditorAction,
): V2NotebookEditorState {
	switch (action.type) {
		case "set_cells": return { ...state, cells: action.cells, activeIndex: Math.min(state.activeIndex, Math.max(0, action.cells.length - 1)) };
		case "set_active": return { ...state, activeIndex: Math.max(0, Math.min(action.index, Math.max(0, state.cells.length - 1))) };
		case "set_draft": return { ...state, draftText: action.text, dirty: true };
		case "set_command": return { ...state, commandLine: action.text };
		case "set_mode": return { ...state, mode: action.mode };
		case "set_message": return { ...state, message: action.message };
		case "mark_clean": return { ...state, dirty: false };
	}
}
