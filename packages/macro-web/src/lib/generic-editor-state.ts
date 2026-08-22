import type { EditorMode } from "@stateful-mcp/macro-protocol";

export interface GenericEditorState {
	readonly enabled: boolean;
	readonly mode: EditorMode;
	readonly cursorOffset: number;
	readonly preferredColumn: number;
	readonly selection: { readonly start: number; readonly end: number } | null;
	readonly visualType: "char" | "line" | null;
	readonly sequenceBuffer: string;
	readonly yankBuffer: string;
	readonly commandText: string;
	readonly focus: "editor" | "external" | "commandLine";
}

export type GenericEditorAction =
	| { readonly type: "setEnabled"; readonly enabled: boolean }
	| { readonly type: "setMode"; readonly mode: EditorMode }
	| {
			readonly type: "setCursor";
			readonly offset: number;
			readonly preferredColumn?: number;
	  }
	| {
			readonly type: "moveOffset";
			readonly delta: number;
			readonly textLength: number;
	  }
	| {
			readonly type: "beginVisual";
			readonly visualType?: "char" | "line";
			readonly offset?: number;
	  }
	| {
			readonly type: "setSelection";
			readonly selection: { readonly start: number; readonly end: number } | null;
	  }
	| { readonly type: "clearVisual" }
	| { readonly type: "setSequence"; readonly value: string }
	| { readonly type: "clearSequence" }
	| { readonly type: "setYank"; readonly value: string }
	| { readonly type: "setCommandText"; readonly value: string }
	| {
			readonly type: "setFocus";
			readonly focus: GenericEditorState["focus"];
	  };

export const createGenericEditorState = (
	enabled = false,
): GenericEditorState => ({
	enabled,
	mode: enabled ? "NORMAL" : "INSERT",
	cursorOffset: 0,
	preferredColumn: 0,
	selection: null,
	visualType: null,
	sequenceBuffer: "",
	yankBuffer: "",
	commandText: "",
	focus: "external",
});

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function reduceGenericEditorState(
	state: GenericEditorState,
	action: GenericEditorAction,
): GenericEditorState {
	switch (action.type) {
		case "setEnabled":
			return action.enabled
				? { ...state, enabled: true, mode: "NORMAL", sequenceBuffer: "" }
				: {
						...state,
						enabled: false,
						mode: "INSERT",
						selection: null,
						visualType: null,
						sequenceBuffer: "",
						commandText: "",
						focus: state.focus === "commandLine" ? "external" : state.focus,
					};
		case "setMode":
			return {
				...state,
				mode: action.mode,
				selection: action.mode === "VISUAL" ? state.selection : null,
				visualType: action.mode === "VISUAL" ? state.visualType : null,
				commandText: action.mode === "COMMAND" ? state.commandText : "",
				sequenceBuffer: "",
			};
		case "setCursor": {
			const offset = Math.max(0, action.offset);
			return {
				...state,
				cursorOffset: offset,
				preferredColumn: action.preferredColumn ?? state.preferredColumn,
			};
		}
		case "moveOffset": {
			const offset = clamp(
				state.cursorOffset + action.delta,
				0,
				Math.max(0, action.textLength),
			);
			return {
				...state,
				cursorOffset: offset,
			};
		}
		case "beginVisual": {
			const anchor = action.offset ?? state.cursorOffset;
			return {
				...state,
				mode: "VISUAL",
				visualType: action.visualType ?? "char",
				selection: { start: anchor, end: anchor },
				sequenceBuffer: "",
			};
		}
		case "setSelection":
			return {
				...state,
				selection: action.selection,
				cursorOffset: action.selection ? action.selection.end : state.cursorOffset,
			};
		case "clearVisual":
			return {
				...state,
				selection: null,
				visualType: null,
				mode: "NORMAL",
			};
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

export function createGenericEditorStore(initialEnabled = false) {
	let state = createGenericEditorState(initialEnabled);
	const listeners = new Set<() => void>();
	const emit = () => listeners.forEach((listener) => listener());
	return {
		getState: () => state,
		dispatch(action: GenericEditorAction) {
			const next = reduceGenericEditorState(state, action);
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
