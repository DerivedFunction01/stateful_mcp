import type { EditorMode } from "@stateful-mcp/macro-protocol";

export interface ScratchpadEditorState {
	readonly enabled: boolean;
	readonly mode: EditorMode;
	readonly activeCellIndex: number;
	readonly caretColumn: number;
	readonly preferredColumn: number;
	readonly visualRange: { readonly start: number; readonly end: number } | null;
	readonly sequenceBuffer: string;
	readonly yankBuffer: string;
	readonly commandText: string;
	readonly focus: "editor" | "external" | "commandLine";
}

export type ScratchpadEditorAction =
	| { readonly type: "setEnabled"; readonly enabled: boolean }
	| { readonly type: "setMode"; readonly mode: EditorMode }
	| {
			readonly type: "setActiveCell";
			readonly index: number;
			readonly count: number;
			readonly column?: number;
	  }
	| {
			readonly type: "moveCell";
			readonly delta: -1 | 1;
			readonly count: number;
			readonly lineLength: number;
	  }
	| {
			readonly type: "moveCharacter";
			readonly delta: -1 | 1;
			readonly lineLength: number;
	  }
	| { readonly type: "beginVisual" }
	| {
			readonly type: "extendVisual";
			readonly delta: -1 | 1;
			readonly count: number;
	  }
	| {
			readonly type: "setVisualFocus";
			readonly index: number;
			readonly count: number;
	  }
	| { readonly type: "swapVisualAnchor" }
	| { readonly type: "clearVisual" }
	| { readonly type: "setSequence"; readonly value: string }
	| { readonly type: "clearSequence" }
	| { readonly type: "setYank"; readonly value: string }
	| { readonly type: "setCommandText"; readonly value: string }
	| {
			readonly type: "setFocus";
			readonly focus: ScratchpadEditorState["focus"];
	  };

export const createScratchpadEditorState = (
	enabled = false,
): ScratchpadEditorState => ({
	enabled,
	mode: "NORMAL",
	activeCellIndex: 0,
	caretColumn: 0,
	preferredColumn: 0,
	visualRange: null,
	sequenceBuffer: "",
	yankBuffer: "",
	commandText: "",
	focus: "external",
});

function clamp(value: number, count: number): number {
	return Math.max(0, Math.min(Math.max(0, count - 1), value));
}

export function reduceScratchpadEditorState(
	state: ScratchpadEditorState,
	action: ScratchpadEditorAction,
): ScratchpadEditorState {
	switch (action.type) {
		case "setEnabled":
			return action.enabled
				? { ...state, enabled: true, mode: "NORMAL", sequenceBuffer: "" }
				: {
						...state,
						enabled: false,
						mode: "INSERT",
						visualRange: null,
						sequenceBuffer: "",
						commandText: "",
						focus: state.focus === "commandLine" ? "external" : state.focus,
					};
		case "setMode":
			return {
				...state,
				mode: action.mode,
				visualRange: action.mode === "VISUAL" ? state.visualRange : null,
				commandText: action.mode === "COMMAND" ? state.commandText : "",
				sequenceBuffer: "",
			};
		case "setActiveCell": {
			const index = clamp(action.index, action.count);
			return {
				...state,
				activeCellIndex: index,
				caretColumn: action.column ?? 0,
				preferredColumn: action.column ?? 0,
			};
		}
		case "moveCell": {
			const index = clamp(state.activeCellIndex + action.delta, action.count);
			const column = Math.min(state.preferredColumn, action.lineLength);
			return {
				...state,
				activeCellIndex: index,
				caretColumn: column,
				preferredColumn: column,
			};
		}
		case "moveCharacter": {
			const column = Math.max(
				0,
				Math.min(action.lineLength, state.caretColumn + action.delta),
			);
			return { ...state, caretColumn: column, preferredColumn: column };
		}
		case "beginVisual":
			return {
				...state,
				mode: "VISUAL",
				visualRange: {
					start: state.activeCellIndex,
					end: state.activeCellIndex,
				},
				sequenceBuffer: "",
			};
		case "extendVisual": {
			const next = clamp(state.activeCellIndex + action.delta, action.count);
			return {
				...state,
				activeCellIndex: next,
				visualRange: state.visualRange
					? { start: state.visualRange.start, end: next }
					: { start: state.activeCellIndex, end: next },
			};
		}
		case "setVisualFocus": {
			const index = clamp(action.index, action.count);
			return {
				...state,
				activeCellIndex: index,
				visualRange: state.visualRange
					? { start: state.visualRange.start, end: index }
					: { start: state.activeCellIndex, end: index },
			};
		}
		case "swapVisualAnchor":
			return state.visualRange
				? {
						...state,
						activeCellIndex: state.visualRange.start,
						visualRange: {
							start: state.visualRange.end,
							end: state.visualRange.start,
						},
					}
				: state;
		case "clearVisual":
			return { ...state, visualRange: null, mode: "NORMAL" };
		case "setSequence":
			return { ...state, sequenceBuffer: action.value };
		case "clearSequence":
			return { ...state, sequenceBuffer: "" };
		case "setYank":
			return { ...state, yankBuffer: action.value };
		case "setCommandText":
			return { ...state, commandText: action.value };
		case "setFocus":
			return { ...state, focus: action.focus };
	}
}

export function createScratchpadEditorStore(initialEnabled = false) {
	let state = createScratchpadEditorState(initialEnabled);
	const listeners = new Set<() => void>();
	const emit = () => listeners.forEach((listener) => listener());
	return {
		getState: () => state,
		dispatch(action: ScratchpadEditorAction) {
			const next = reduceScratchpadEditorState(state, action);
			if (next !== state) {
				state = next;
				emit();
			}
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
