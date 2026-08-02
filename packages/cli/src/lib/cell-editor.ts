import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type {
	Cell,
	CellCollectionRef,
	CellIntentKind,
} from "@stateful-mcp/clinical/session/cell";
import type { CellInputSegment } from "@stateful-mcp/clinical/session/cell-input-segmentation";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import type { Key } from "ink";
import type { ReactElement } from "react";
import type { CompletionState } from "./completion-state";

export type CellEditorMode = EditorMode;

// ── Document layer ──────────────────────────────────────────────────────────

export interface DocumentView {
	cells: Cell[];
	activeIndex: number;
	selection?: { start: number; end: number } | null;
}
export type DocumentAction =
	| { type: "move"; delta: number }
	| { type: "setActive"; index: number }
	| { type: "insertBelow" }
	| { type: "insertAbove" }
	| { type: "deleteActive" }
	| { type: "yankActive" }
	| { type: "paste" }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "enterVisual" }
	| { type: "extendSelection"; delta: number }
	| { type: "swapAnchor" }
	| { type: "deleteSelection" }
	| { type: "yankSelection" };

export interface DocumentPort {
	getView(): DocumentView;
	dispatch(action: DocumentAction): void;
}

// ── Domain execution layer ──────────────────────────────────────────────────

export type DomainAction =
	| { type: "run"; cellIds?: string[]; indexes?: number[] }
	| { type: "preview" }
	| { type: "showInfo" }
	| { type: "openWorkspace" }
	| { type: "quit" };

export interface CommandResult {
	success: boolean;
	message?: string;
	action?: string;
	data?: unknown;
}

export interface DomainPort {
	run(
		context: EditorContext,
		action: { cellIds?: string[]; indexes?: number[] },
	): Promise<void>;
	preview(context: EditorContext): Promise<void>;
	dispatchCommand(line: string, context: EditorContext): Promise<CommandResult>;
}

// ── Keymap policy ───────────────────────────────────────────────────────────

export type KeyResolution =
	| { kind: "generic"; action: EditorAction }
	| { kind: "document"; action: DocumentAction }
	| { kind: "domain"; action: DomainAction }
	| { kind: "none"; nextPending: string };

export interface KeymapPolicy {
	resolve(
		input: string,
		key: Key,
		mode: EditorMode,
		pending: string,
	): KeyResolution;
}

// ── Window composition ──────────────────────────────────────────────────────

export type WindowSlot =
	| "primary"
	| "command"
	| "status"
	| "footer"
	| "sidebar"
	| "overlay";

export interface WindowRegion {
	slot: WindowSlot;
	/** Stable key for React reconciliation. */
	key: string;
	render(): ReactElement | null;
}

export interface WindowDefinition {
	type: string;
	regions: () => WindowRegion[];
}

// ── Overlay routing ─────────────────────────────────────────────────────────

export type WindowOverlayRoute = "help" | "preview" | "info";

export interface WindowOverlay {
	route: WindowOverlayRoute;
	payload?: unknown;
	originCellId?: string;
}

export type WindowOverlayAction =
	| "close"
	| "accept"
	| "edit"
	| "toggle"
	| "next"
	| "prev";

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
	| { type: "INSERT_TEXT"; text: string }
	| { type: "NEWLINE" }
	| { type: "BACKSPACE" }
	| { type: "SET_DRAFT"; text: string }
	| { type: "SET_COMPLETION"; completion: CompletionState }
	| { type: "SHOW_HELP"; show: boolean }
	| { type: "SET_ERROR"; error: string | null }
	| { type: "CANCEL" };

export interface EditorContext {
	hostKind: string;
	collection: CellCollectionRef;
	sessionId: string;
	activeBranchId?: string;
}

export interface CommandCatalog {
	getDescriptors(context: EditorContext): CommandDescriptor[];
	getSuggestions(
		partial: string,
		context: EditorContext,
	): AutocompleteSuggestion[];
}

export interface SubmissionPort {
	plan(text: string, context: EditorContext): CellSubmissionPlan;
	submit(plan: CellSubmissionPlan, context: EditorContext): Promise<void>;
}

export interface CellSubmissionSegment extends CellInputSegment {
	cellId?: string;
	intentKind: CellIntentKind;
}

export interface CellSubmissionPlan {
	submissionId: string;
	collection: CellCollectionRef;
	segments: CellSubmissionSegment[];
}

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

export function currentCommandLine(draftText: string): string {
	const line = draftText.split("\n").at(-1)?.trimStart() ?? "";
	return line.startsWith(":") ? line : "";
}

export function replaceCurrentLine(draftText: string, line: string): string {
	const lines = draftText.split("\n");
	lines[lines.length - 1] = line;
	return lines.join("\n");
}
