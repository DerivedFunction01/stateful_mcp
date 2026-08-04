import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { Key } from "ink";
import type { DocumentAction } from "./document";
import type { DomainAction } from "./domain";
import { EditorAction } from "./editor-action";
import type { EditorKeymapProfile } from "./editor-keymap-profile";
import {
	chordMatches,
	isSpecialChord,
	SpecialKeys,
} from "./editor-keymap-profile";
import type { EditorAction as KernelEditorAction } from "./kernel";

export type KeyResolution =
	| { kind: "generic"; action: KernelEditorAction }
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

/**
 * Minimal key resolution for overlay components (e.g. the cell info
 * inspector) that do not participate in the full editor window keymap.
 *
 * The bindings are kept as data here so keys stay centralized and follow the
 * same style as the editor keymap, without requiring the WindowContainer /
 * extension registry machinery needed by editor windows.
 */
export type InspectorAction =
	| "close"
	| "scrollDown"
	| "scrollUp"
	| "pageDown"
	| "pageUp"
	| "scrollTop"
	| "scrollBottom";

interface InspectorBinding {
	action: InspectorAction;
	keys: string[];
	match: (key: Key) => boolean;
}

function isInput(binding: InspectorBinding, input: string, key: Key): boolean {
	return binding.keys.includes(input) || binding.match(key);
}

const inspectorBindings: readonly InspectorBinding[] = [
	{
		action: "close",
		keys: ["i", "I", "q"],
		match: (key) => key.escape === true,
	},
	{ action: "scrollDown", keys: ["j"], match: (key) => key.downArrow === true },
	{ action: "scrollUp", keys: ["k"], match: (key) => key.upArrow === true },
	{ action: "pageDown", keys: [], match: (key) => key.pageDown === true },
	{ action: "pageUp", keys: [], match: (key) => key.pageUp === true },
	{ action: "scrollTop", keys: [], match: (key) => key.home === true },
	{ action: "scrollBottom", keys: [], match: (key) => key.end === true },
];

/**
 * Resolve an overlay key press to an InspectorAction, or null if no binding
 * matches. This keeps component-level input handling free of hardcoded keys.
 */
export function resolveInspectorKey(
	input: string,
	key: Key,
): InspectorAction | null {
	for (const binding of inspectorBindings) {
		if (isInput(binding, input, key)) return binding.action;
	}
	return null;
}

/**
 * Map Key + input string to EditorAction based on current mode.
 * Supports multi-key sequences (dd, yy, [e, ]e).
 * VISUAL mode uses the same j/k as NORMAL but with EXTEND_SELECTION.
 */
export function resolveKey(
	input: string,
	key: Key,
	mode: EditorMode,
	pendingSequence: string,
	profile: EditorKeymapProfile,
): { action: EditorAction | null; nextPending: string; char?: string } {
	if (mode === "COMMAND") {
		return { action: null, nextPending: "" };
	}

	if (mode === "MACRO") {
		if (key.escape)
			return { action: EditorAction.ExitInsertMode, nextPending: "" };
		if (key.ctrl && key.return)
			return { action: EditorAction.SubmitMacro, nextPending: "" };
		if (key.return)
			return { action: EditorAction.TypeChar, nextPending: "", char: "\n" };
		if (key.backspace)
			return { action: EditorAction.Backspace, nextPending: "" };
		if (input.length === 1 && !key.ctrl && !key.meta)
			return { action: EditorAction.TypeChar, nextPending: "", char: input };
		return { action: null, nextPending: pendingSequence };
	}

	if (mode === "INSERT") {
		if (key.escape)
			return { action: EditorAction.ExitInsertMode, nextPending: "" };
		if (key.return)
			return { action: EditorAction.TypeChar, nextPending: "", char: "\n" };
		if (key.backspace)
			return { action: EditorAction.Backspace, nextPending: "" };
		if (input.length === 1 && !key.ctrl && !key.meta) {
			return { action: EditorAction.TypeChar, nextPending: "", char: input };
		}
		return { action: null, nextPending: pendingSequence };
	}

	if (mode === "VISUAL") {
		const v = profile.visual;
		if (chordMatches(SpecialKeys.Escape, input, key))
			return { action: EditorAction.ExitVisualMode, nextPending: "" };
		if (
			!isSpecialChord(v.deleteSelection) &&
			chordMatches(v.deleteSelection, input, key)
		)
			return { action: EditorAction.DeleteSelection, nextPending: "" };
		if (chordMatches(v.yankSelection, input, key))
			return { action: EditorAction.YankSelection, nextPending: "" };
		if (chordMatches(v.pasteSelection, input, key))
			return { action: EditorAction.PasteCell, nextPending: "" };
		if (chordMatches(profile.normal.runCell, input, key))
			return { action: EditorAction.RunCell, nextPending: "" };
		if (chordMatches(v.extendDown, input, key) || key.downArrow)
			return { action: EditorAction.ExtendSelectionDown, nextPending: "" };
		if (chordMatches(v.extendUp, input, key) || key.upArrow)
			return { action: EditorAction.ExtendSelectionUp, nextPending: "" };
		if (chordMatches(v.swapAnchor, input, key))
			return { action: EditorAction.SwapSelectionAnchor, nextPending: "" };
		if (chordMatches(profile.normal.command, input, key))
			return { action: EditorAction.OpenCommandLine, nextPending: "" };
		if (chordMatches(profile.normal.quit, input, key))
			return { action: EditorAction.Quit, nextPending: "" };
		return { action: null, nextPending: "" };
	}

	// NORMAL mode: resolve multi-key sequences first, then single chords.
	const { normal, sequences } = profile;

	if (
		chordMatches(sequences.deleteCell, input, key) ||
		`${pendingSequence}${input}` === sequences.deleteCell
	)
		return { action: EditorAction.DeleteCell, nextPending: "" };
	if (
		chordMatches(sequences.yankCell, input, key) ||
		`${pendingSequence}${input}` === sequences.yankCell
	)
		return { action: EditorAction.YankCell, nextPending: "" };
	if (
		chordMatches(sequences.previousError, input, key) ||
		`${pendingSequence}${input}` === sequences.previousError
	)
		return { action: EditorAction.PrevError, nextPending: "" };
	if (
		chordMatches(sequences.nextError, input, key) ||
		`${pendingSequence}${input}` === sequences.nextError
	)
		return { action: EditorAction.NextError, nextPending: "" };
	if (
		chordMatches(sequences.workspace, input, key) ||
		`${pendingSequence}${input}` === sequences.workspace
	)
		return { action: EditorAction.OpenWorkspace, nextPending: "" };
	if (
		chordMatches(sequences.pasteAbove, input, key) ||
		`${pendingSequence}${input}` === sequences.pasteAbove
	)
		return { action: EditorAction.PasteCellAbove, nextPending: "" };

	// If the pending+input forms a strict prefix of a configured sequence, await more input.
	if (pendingSequence) {
		const seq = pendingSequence + input;
		if (
			[
				sequences.deleteCell,
				sequences.yankCell,
				sequences.previousError,
				sequences.nextError,
				sequences.workspace,
				sequences.pasteAbove,
			].some((s) => s.startsWith(seq) && s !== seq)
		) {
			return { action: null, nextPending: seq };
		}
	}

	// Tab/ctrl handled by caller; arrow keys mapped to navigation.
	if (key.downArrow) return { action: EditorAction.MoveDown, nextPending: "" };
	if (key.upArrow) return { action: EditorAction.MoveUp, nextPending: "" };
	if (key.return)
		return { action: EditorAction.EnterInsertMode, nextPending: "" };
	if (key.escape) return { action: null, nextPending: "" };
	if (key.backspace) return { action: null, nextPending: "" };
	if (chordMatches(normal.redo, input, key))
		return { action: EditorAction.Redo, nextPending: "" };

	// Single-character NORMAL bindings.
	if (input.length === 1 && !key.ctrl && !key.meta) {
		if (chordMatches(normal.moveDown, input, key))
			return { action: EditorAction.MoveDown, nextPending: "" };
		if (chordMatches(normal.moveUp, input, key))
			return { action: EditorAction.MoveUp, nextPending: "" };
		if (chordMatches(normal.enterInsert, input, key))
			return { action: EditorAction.EnterInsertMode, nextPending: "" };
		if (chordMatches(normal.insertBelow, input, key))
			return { action: EditorAction.InsertBelow, nextPending: "" };
		if (chordMatches(normal.insertAbove, input, key))
			return { action: EditorAction.InsertAbove, nextPending: "" };
		if (chordMatches(normal.enterVisual, input, key))
			return { action: EditorAction.EnterVisualMode, nextPending: "" };
		if (chordMatches(normal.pasteBelow, input, key))
			return { action: EditorAction.PasteCell, nextPending: "" };
		if (chordMatches(normal.previewCell, input, key))
			return { action: EditorAction.PreviewCell, nextPending: "" };
		if (chordMatches(normal.runCell, input, key))
			return { action: EditorAction.RunCell, nextPending: "" };
		if (chordMatches(normal.undo, input, key))
			return { action: EditorAction.Undo, nextPending: "" };
		if (chordMatches(normal.info, input, key))
			return { action: EditorAction.Info, nextPending: "" };
		if (chordMatches(normal.command, input, key))
			return { action: EditorAction.OpenCommandLine, nextPending: "" };
		if (chordMatches(normal.macro, input, key))
			return { action: EditorAction.OpenMacroInput, nextPending: "" };
		if (
			chordMatches(normal.search, input, key) ||
			chordMatches(normal.searchAlt, input, key)
		)
			return { action: EditorAction.Search, nextPending: "" };

		// Sequence starters that are not also single actions produce pending state.
		const starters = new Set(
			[
				sequences.deleteCell,
				sequences.yankCell,
				sequences.previousError,
				sequences.nextError,
				sequences.workspace,
				sequences.pasteAbove,
			]
				.map((s) => s[0])
				.filter((c): c is string => Boolean(c)),
		);
		if (starters.has(input) && pendingSequence === "") {
			return { action: null, nextPending: input };
		}
	}

	return { action: null, nextPending: "" };
}
