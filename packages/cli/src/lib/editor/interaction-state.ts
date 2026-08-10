import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";

export type EditorFocusTarget =
	| "history"
	| "assessment-scratchpad"
	| "subjective-scratchpad"
	| "objective-scratchpad"
	| "plan-scratchpad"
	| "macro-console"
	| "workspace-pane";

export type CellSelection = {
	anchor: number;
	active: number;
};

export type TextSelection = {
	anchor: number;
	active: number;
};

export interface EditorInteractionState {
	focus: EditorFocusTarget;
	returnFocus: EditorFocusTarget;
	mode: NotebookEditorMode;
	cellSelection: CellSelection | null;
	textSelection: TextSelection | null;
}

export type EditorInteractionAction =
	| { type: "focus"; target: EditorFocusTarget }
	| { type: "toggle-console" }
	| { type: "enter-insert" }
	| { type: "enter-visual"; anchor?: number }
	| { type: "extend-visual"; delta: -1 | 1 }
	| { type: "set-text-active"; active: number }
	| { type: "exit-to-normal" }
	| { type: "set-mode"; mode: NotebookEditorMode };

export const INITIAL_EDITOR_INTERACTION_STATE: EditorInteractionState = {
	focus: "history",
	returnFocus: "history",
	mode: "NORMAL",
	cellSelection: null,
	textSelection: null,
};

export function focusForSection(
	section: "assessment" | "subjective" | "objective" | "plan",
): EditorFocusTarget {
	return `${section}-scratchpad` as EditorFocusTarget;
}

export function supportsVisual(target: EditorFocusTarget): boolean {
	return target !== "workspace-pane";
}

export function normalizeModeForFocus(
	target: EditorFocusTarget,
	mode: NotebookEditorMode,
): NotebookEditorMode {
	if (mode === "VISUAL" && !supportsVisual(target)) return "NORMAL";
	return mode;
}

export function reduceEditorInteraction(
	state: EditorInteractionState,
	action: EditorInteractionAction,
): EditorInteractionState {
	switch (action.type) {
		case "focus":
			return {
				...state,
				focus: action.target,
				returnFocus:
					action.target === "macro-console" ? state.returnFocus : action.target,
				mode: normalizeModeForFocus(action.target, state.mode),
				cellSelection: null,
				textSelection: null,
			};
		case "toggle-console": {
			const opening = state.focus !== "macro-console";
			const target = opening ? "macro-console" : state.returnFocus;
			return {
				...state,
				focus: target,
				returnFocus: opening ? state.focus : state.returnFocus,
				mode: "NORMAL",
				cellSelection: null,
				textSelection: null,
			};
		}
		case "enter-insert":
			return {
				...state,
				mode: "INSERT",
				cellSelection: null,
				textSelection: null,
			};
		case "enter-visual":
			if (!supportsVisual(state.focus)) return { ...state, mode: "NORMAL" };
			return state.focus === "macro-console"
				? {
						...state,
						mode: "VISUAL",
						textSelection: {
							anchor: action.anchor ?? 0,
							active: action.anchor ?? 0,
						},
					}
				: {
						...state,
						mode: "VISUAL",
						cellSelection: {
							anchor: action.anchor ?? 0,
							active: action.anchor ?? 0,
						},
					};
		case "extend-visual":
			if (state.mode !== "VISUAL") return state;
			if (state.focus === "macro-console" && state.textSelection) {
				return {
					...state,
					textSelection: {
						...state.textSelection,
						active: Math.max(0, state.textSelection.active + action.delta),
					},
				};
			}
			if (state.cellSelection) {
				return {
					...state,
					cellSelection: {
						...state.cellSelection,
						active: Math.max(0, state.cellSelection.active + action.delta),
					},
				};
			}
			return state;
		case "set-text-active":
			return state.textSelection
				? {
						...state,
						textSelection: {
							...state.textSelection,
							active: Math.max(0, action.active),
						},
					}
				: state;
		case "exit-to-normal":
			return {
				...state,
				mode: "NORMAL",
				cellSelection: null,
				textSelection: null,
			};
		case "set-mode":
			return {
				...state,
				mode: normalizeModeForFocus(state.focus, action.mode),
				...(action.mode !== "VISUAL"
					? { cellSelection: null, textSelection: null }
					: {}),
			};
	}
}

export function selectionBounds(selection: CellSelection | TextSelection): {
	start: number;
	end: number;
} {
	return {
		start: Math.min(selection.anchor, selection.active),
		end: Math.max(selection.anchor, selection.active),
	};
}
