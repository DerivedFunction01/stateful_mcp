import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import type { Key } from "ink";

/**
 * Map Ink Key + input string to EditorAction based on current mode.
 * Supports multi-key sequences (dd, yy, [e, ]e).
 * VISUAL mode uses the same j/k as NORMAL but with EXTEND_SELECTION.
 */
export function resolveKey(
	input: string,
	key: Key,
	mode: EditorMode,
	pendingSequence: string,
): { action: EditorAction | null; nextPending: string; char?: string } {
	if (mode === "COMMAND") {
		return { action: null, nextPending: "" };
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

	// Ctrl-R in any non-INSERT mode
	if (key.ctrl && (input === "\x12" || input === "r")) {
		return { action: EditorAction.Redo, nextPending: "" };
	}

	if (mode === "VISUAL") {
		if (key.escape || input === "V" || input === "v") {
			return { action: null, nextPending: "", char: undefined };
		}
		if (input === "d")
			return { action: EditorAction.DeleteSelection, nextPending: "" };
		if (input === "y")
			return { action: EditorAction.YankSelection, nextPending: "" };
		if (input === "r") return { action: EditorAction.RunCell, nextPending: "" };
		if (input === "j" || key.downArrow)
			return { action: EditorAction.ExtendSelectionDown, nextPending: "" };
		if (input === "k" || key.upArrow)
			return { action: EditorAction.ExtendSelectionUp, nextPending: "" };
		if (input === "o")
			return { action: EditorAction.SwapSelectionAnchor, nextPending: "" };
		if (input === ":")
			return { action: EditorAction.OpenCommandLine, nextPending: "" };
		if (input === "q") return { action: EditorAction.Quit, nextPending: "" };
		return { action: null, nextPending: "" };
	}

	// NORMAL mode
	const seq = pendingSequence + input;

	if (seq === "dd") return { action: EditorAction.DeleteCell, nextPending: "" };
	if (seq === "yy") return { action: EditorAction.YankCell, nextPending: "" };
	if (seq === "[e") return { action: EditorAction.PrevError, nextPending: "" };
	if (seq === "]e") return { action: EditorAction.NextError, nextPending: "" };
	if (seq === "gw")
		return { action: EditorAction.OpenWorkspace, nextPending: "" };

	if (seq.length >= 2) return { action: null, nextPending: "" };

	if (seq.length === 1) {
		switch (seq) {
			case "j":
				return { action: EditorAction.MoveDown, nextPending: "" };
			case "k":
				return { action: EditorAction.MoveUp, nextPending: "" };
			case "i":
				return { action: EditorAction.EnterInsertMode, nextPending: "" };
			case "o":
				return { action: EditorAction.InsertBelow, nextPending: "" };
			case "O":
				return { action: EditorAction.InsertAbove, nextPending: "" };
			case "I":
				return { action: EditorAction.Info, nextPending: "" };
			case "d":
				return { action: null, nextPending: "d" };
			case "y":
				return { action: null, nextPending: "y" };
			case "[":
				return { action: null, nextPending: "[" };
			case "]":
				return { action: null, nextPending: "]" };
			case "g":
				return { action: null, nextPending: "g" };
			case "p":
				return { action: EditorAction.PasteCell, nextPending: "" };
			case "P":
				return { action: EditorAction.PreviewCell, nextPending: "" };
			case "u":
				return { action: EditorAction.Undo, nextPending: "" };
			case "r":
				return { action: EditorAction.RunCell, nextPending: "" };
			case ":":
				return { action: EditorAction.OpenCommandLine, nextPending: "" };
			case "s":
				return { action: EditorAction.Search, nextPending: "" };
			case "/":
				return { action: EditorAction.Search, nextPending: "" };
			case "V":
				return { action: EditorAction.EnterVisualMode, nextPending: "" };
			default:
				return { action: null, nextPending: "" };
		}
	}

	if (key.downArrow) return { action: EditorAction.MoveDown, nextPending: "" };
	if (key.upArrow) return { action: EditorAction.MoveUp, nextPending: "" };
	if (key.return)
		return { action: EditorAction.EnterInsertMode, nextPending: "" };
	if (key.escape) return { action: null, nextPending: "" };
	if (key.backspace) return { action: null, nextPending: "" };
	if (key.delete) return { action: EditorAction.DeleteCell, nextPending: "" };

	return { action: null, nextPending: "" };
}
