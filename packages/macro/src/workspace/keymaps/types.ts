/**
 * Typed declarative keymap profile contracts and strict canonical chord definitions.
 */

export const CANONICAL_KEYS = {
	// ── Modifiers ─────────────────────────────────────────────────────────────
	MODIFIERS: ["ctrl", "meta", "shift"] as const,

	// ── Navigation & Control ──────────────────────────────────────────────────
	NAVIGATION: [
		"up",
		"down",
		"left",
		"right",
		"pageup",
		"pagedown",
		"home",
		"end",
	] as const,

	// ── Editing & Control ─────────────────────────────────────────────────────
	EDITING: [
		"enter",
		"escape",
		"tab",
		"backspace",
		"delete",
		"insert",
		"space",
	] as const,

	// ── Function Keys ─────────────────────────────────────────────────────────
	FUNCTION: [
		"f1",
		"f2",
		"f3",
		"f4",
		"f5",
		"f6",
		"f7",
		"f8",
		"f9",
		"f10",
		"f11",
		"f12",
	] as const,

	// ── QWERTY Letters ────────────────────────────────────────────────────────
	LETTERS: [
		"a",
		"b",
		"c",
		"d",
		"e",
		"f",
		"g",
		"h",
		"i",
		"j",
		"k",
		"l",
		"m",
		"n",
		"o",
		"p",
		"q",
		"r",
		"s",
		"t",
		"u",
		"v",
		"w",
		"x",
		"y",
		"z",
	] as const,

	// ── Digits ────────────────────────────────────────────────────────────────
	DIGITS: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const,

	// ── Symbols & Punctuation ─────────────────────────────────────────────────
	SYMBOLS: [
		"-",
		"=",
		"[",
		"]",
		"\\",
		";",
		"'",
		",",
		".",
		"/",
		"`",
		":",
		"^",
		"!",
		"@",
		"#",
		"$",
		"%",
		"&",
		"*",
		"(",
		")",
		"_",
		"+",
		"{",
		"}",
		"|",
		"<",
		">",
		"?",
		"~",
		'"',
	] as const,
} as const;

export type CanonicalModifier = (typeof CANONICAL_KEYS.MODIFIERS)[number];
export type CanonicalKey =
	| (typeof CANONICAL_KEYS.NAVIGATION)[number]
	| (typeof CANONICAL_KEYS.EDITING)[number]
	| (typeof CANONICAL_KEYS.FUNCTION)[number]
	| (typeof CANONICAL_KEYS.LETTERS)[number]
	| (typeof CANONICAL_KEYS.DIGITS)[number]
	| (typeof CANONICAL_KEYS.SYMBOLS)[number];

export const ALL_CANONICAL_KEYS = new Set<string>([
	...CANONICAL_KEYS.NAVIGATION,
	...CANONICAL_KEYS.EDITING,
	...CANONICAL_KEYS.FUNCTION,
	...CANONICAL_KEYS.LETTERS,
	...CANONICAL_KEYS.DIGITS,
	...CANONICAL_KEYS.SYMBOLS,
]);

export const ALL_CANONICAL_MODIFIERS = new Set<string>(
	CANONICAL_KEYS.MODIFIERS,
);

export type KeyChord = string;

export interface EditorKeymapNormalBindings {
	readonly moveDown: KeyChord;
	readonly moveUp: KeyChord;
	readonly moveLeft: KeyChord;
	readonly moveRight: KeyChord;
	readonly enterInsert: KeyChord;
	readonly insertBelow: KeyChord;
	readonly insertAbove: KeyChord;
	readonly enterVisual: KeyChord;
	readonly pasteBelow: KeyChord;
	readonly previewCell: KeyChord;
	readonly runCell: KeyChord;
	readonly undo: KeyChord;
	readonly redo: KeyChord;
	readonly command: KeyChord;
	readonly macro: KeyChord;
	readonly search: KeyChord;
	readonly searchAlt: KeyChord;
	readonly info: KeyChord;
	readonly quit: KeyChord;
}

export interface EditorKeymapSequenceBindings {
	readonly deleteCell: KeyChord;
	readonly yankCell: KeyChord;
	readonly previousError: KeyChord;
	readonly nextError: KeyChord;
	readonly workspace: KeyChord;
	readonly pasteAbove: KeyChord;
}

export interface EditorKeymapVisualBindings {
	readonly deleteSelection: KeyChord;
	readonly yankSelection: KeyChord;
	readonly pasteSelection: KeyChord;
	readonly extendDown: KeyChord;
	readonly extendUp: KeyChord;
	readonly extendLeft: KeyChord;
	readonly extendRight: KeyChord;
	readonly swapAnchor: KeyChord;
}

export interface EditorKeymapWindowBindings {
	readonly toggleSidepanel: KeyChord;
	readonly toggleActivityPanel?: KeyChord;
	readonly switchSplitFocus: KeyChord;
	readonly openCommandPalette: KeyChord;
	readonly nextTab: KeyChord;
	readonly prevTab: KeyChord;
	readonly pinMacro?: KeyChord;
}

export interface EditorKeymapProfile {
	readonly profileId: string;
	readonly name: string;
	readonly description?: string;
	readonly normal: EditorKeymapNormalBindings;
	readonly sequences: EditorKeymapSequenceBindings;
	readonly visual: EditorKeymapVisualBindings;
	readonly window: EditorKeymapWindowBindings;
}
