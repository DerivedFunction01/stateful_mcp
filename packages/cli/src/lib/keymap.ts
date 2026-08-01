import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import type { Key } from "ink";

export type EditorMode = "NORMAL" | "INSERT";

/**
 * Map Ink Key + input string to EditorAction based on current mode.
 * Returns null when input should be ignored (e.g., no binding).
 *
 * In NORMAL mode: single-key and multi-key sequences (like dd).
 * In INSERT mode: raw characters pass through, Esc returns to NORMAL.
 */
export function resolveKey(
	input: string,
	key: Key,
	mode: EditorMode,
	pendingSequence: string,
): { action: EditorAction | null; nextPending: string; char?: string } {
	if (mode === "INSERT") {
		if (key.escape) {
			return { action: EditorAction.ExitInsertMode, nextPending: "" };
		}
		if (key.return) {
			return {
				action: EditorAction.CommitCell,
				nextPending: "",
				char: "\n",
			};
		}
		if (key.backspace) {
			return { action: EditorAction.Backspace, nextPending: "" };
		}
		if (input.length === 1 && !key.ctrl && !key.meta) {
			return { action: EditorAction.TypeChar, nextPending: "", char: input };
		}
		return { action: null, nextPending: pendingSequence };
	}

	// NORMAL mode
	const seq = pendingSequence + input;

	if (seq === "dd") {
		return { action: EditorAction.DeleteCell, nextPending: "" };
	}

	if (seq.length >= 2 && seq !== "dd") {
		return { action: null, nextPending: "" };
	}

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
			case "d":
				return { action: null, nextPending: "d" };
			case "q":
				return { action: EditorAction.Quit, nextPending: "" };
			case "r":
				return { action: EditorAction.RunCell, nextPending: "" };
			case "p":
			case "P":
				return { action: EditorAction.PreviewCell, nextPending: "" };
			default:
				return { action: null, nextPending: "" };
		}
	}

	// Arrow keys
	if (key.downArrow) {
		return { action: EditorAction.MoveDown, nextPending: "" };
	}
	if (key.upArrow) {
		return { action: EditorAction.MoveUp, nextPending: "" };
	}
	if (key.return) {
		return { action: EditorAction.EnterInsertMode, nextPending: "" };
	}
	if (key.escape) {
		return { action: null, nextPending: "" };
	}
	if (key.backspace) {
		return { action: null, nextPending: "" };
	}
	if (key.delete) {
		return { action: EditorAction.DeleteCell, nextPending: "" };
	}

	return { action: null, nextPending: "" };
}