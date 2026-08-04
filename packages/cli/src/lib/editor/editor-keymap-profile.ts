import type { Key } from "ink";

/** Special key chords encoded as token strings so the profile stays data/serializable. */
export const SpecialKeys = {
	CtrlR: "CTRL_R",
	Enter: "ENTER",
	Escape: "ESC",
	Delete: "DELETE",
	Up: "UP",
	Down: "DOWN",
} as const;

export type KeyChord = string;

const SPECIAL_TOKENS = new Set<string>(Object.values(SpecialKeys));

export function isSpecialChord(chord: string): boolean {
	return SPECIAL_TOKENS.has(chord);
}

/** Matches a single-chord binding (character or special key) against an Ink event. */
export function chordMatches(chord: string, input: string, key: Key): boolean {
	if (isSpecialChord(chord)) {
		switch (chord) {
			case SpecialKeys.CtrlR:
				return Boolean(key.ctrl) && (input.toLowerCase() === "r" || input === "\x12");
			case SpecialKeys.Enter:
				return Boolean(key.return);
			case SpecialKeys.Escape:
				return Boolean(key.escape);
			case SpecialKeys.Delete:
				return Boolean(key.delete);
			case SpecialKeys.Up:
				return Boolean(key.upArrow);
			case SpecialKeys.Down:
				return Boolean(key.downArrow);
			default:
				return false;
		}
	}
	// Plain printable single character.
	return input === chord && !key.ctrl && !key.meta;
}

export interface EditorKeymapNormalBindings {
	moveDown: string;
	moveUp: string;
	enterInsert: string;
	insertBelow: string;
	insertAbove: string;
	enterVisual: string;
	pasteBelow: string;
	previewCell: string;
	runCell: string;
	undo: string;
	redo: string;
	command: string;
	macro: string;
	search: string;
	searchAlt: string;
	info: string;
	quit: string;
}

export interface EditorKeymapSequenceBindings {
	deleteCell: string;
	yankCell: string;
	previousError: string;
	nextError: string;
	workspace: string;
	pasteAbove: string;
}

export interface EditorKeymapVisualBindings {
	deleteSelection: string;
	yankSelection: string;
	pasteSelection: string;
	extendDown: string;
	extendUp: string;
	swapAnchor: string;
}

export interface EditorKeymapProfile {
	profileId: string;
	normal: EditorKeymapNormalBindings;
	sequences: EditorKeymapSequenceBindings;
	visual: EditorKeymapVisualBindings;
}
