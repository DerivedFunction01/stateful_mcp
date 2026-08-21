/**
 * Typed declarative keymap profile contracts and strict canonical chord definitions.
 */

export const CANONICAL_KEYS = {
	// ── Modifiers ─────────────────────────────────────────────────────────────
	MODIFIERS: ["ctrl", "meta", "primary", "shift"] as const,

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
export type KeyChordVariants = readonly KeyChord[];
export type KeyChordValue = KeyChord | readonly KeyChord[];

import type { ContextExpression } from "../contributions/types";
import type { EditorMode } from "../editor/editor-kernel";

/** Canonical command-to-chord binding owned by the Macro keymap catalog. */
export interface WorkspaceKeybinding {
	readonly command: string;
	readonly chords: KeyChordVariants;
	readonly modes?: readonly EditorMode[];
	readonly when?: ContextExpression;
	readonly labelI18nKey?: string;
}

export interface KeymapContext {
	readonly activeTabId?: string;
	readonly activeViewId?: string;
	readonly focusedPane?: string;
	readonly focusedRegion?: string;
	readonly editorMode: EditorMode;
	readonly textInputOwner?: string;
}

export interface EditorKeymapNormalBindings {
	readonly moveDown: KeyChordValue;
	readonly moveUp: KeyChordValue;
	readonly moveLeft: KeyChordValue;
	readonly moveRight: KeyChordValue;
	readonly enterInsert: KeyChordValue;
	readonly insertBelow: KeyChordValue;
	readonly insertAbove: KeyChordValue;
	readonly enterVisual: KeyChordValue;
	readonly pasteBelow: KeyChordValue;
	readonly previewCell: KeyChordValue;
	readonly runCell: KeyChordValue;
	readonly undo: KeyChordValue;
	readonly redo: KeyChordValue;
	readonly command: KeyChordValue;
	readonly macro: KeyChordValue;
	readonly search: KeyChordValue;
	readonly searchAlt: KeyChordValue;
	readonly info: KeyChordValue;
	readonly quit: KeyChordValue;
}

export interface EditorKeymapSequenceBindings {
	readonly deleteCell: KeyChordValue;
	readonly yankCell: KeyChordValue;
	readonly previousError: KeyChordValue;
	readonly nextError: KeyChordValue;
	readonly workspace: KeyChordValue;
	readonly pasteAbove: KeyChordValue;
}

export interface EditorKeymapVisualBindings {
	readonly deleteSelection: KeyChordValue;
	readonly yankSelection: KeyChordValue;
	readonly pasteSelection: KeyChordValue;
	readonly extendDown: KeyChordValue;
	readonly extendUp: KeyChordValue;
	readonly extendLeft: KeyChordValue;
	readonly extendRight: KeyChordValue;
	readonly swapAnchor: KeyChordValue;
}

export interface EditorKeymapWorkbenchBindings {
	readonly toggleSidepanel: KeyChordValue;
	readonly toggleActivityPanel?: KeyChordValue;
	readonly toggleDrawer?: KeyChordValue;
	readonly switchSplitFocus?: KeyChordValue;
	readonly splitGroup?: KeyChordValue;
	readonly openCommandPalette: KeyChordValue;
	readonly quickOpen?: KeyChordValue;
	readonly openSettings?: KeyChordValue;
	readonly nextTab: KeyChordValue;
	readonly prevTab: KeyChordValue;
	readonly pinMacro?: KeyChordValue;
}

export type EditorKeymapWindowBindings = EditorKeymapWorkbenchBindings;

export interface EditorKeymapVimSection {
	readonly normal: EditorKeymapNormalBindings;
	readonly visual: EditorKeymapVisualBindings;
	readonly sequences: EditorKeymapSequenceBindings;
}

export type CommandAliasValue = string | readonly string[];

export interface EditorKeymapProfile {
	readonly profileId: string;
	readonly name: string;
	readonly description?: string;
	readonly vim?: EditorKeymapVimSection;
	readonly workbench?: EditorKeymapWorkbenchBindings;
	readonly normal: EditorKeymapNormalBindings;
	readonly sequences: EditorKeymapSequenceBindings;
	readonly visual: EditorKeymapVisualBindings;
	readonly window: EditorKeymapWindowBindings;
	/** Command-centric overrides. Presence replaces the command's defaults. */
	readonly keybindings?: Readonly<Record<string, KeyChordVariants>>;
	/** Multi-alias mapping: command ID -> alias string(s) */
	readonly aliases?: Readonly<Record<string, CommandAliasValue>>;
}
