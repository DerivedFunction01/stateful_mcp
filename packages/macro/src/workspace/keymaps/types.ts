/**
 * Typed declarative keymap profile contracts and chord definitions.
 */

export const SpecialKeys = {
	CtrlR: "CTRL_R",
	CtrlS: "CTRL_S",
	CtrlShiftR: "CTRL_SHIFT_R",
	CtrlAltR: "CTRL_ALT_R",
	CtrlP: "CTRL_P",
	CtrlB: "CTRL_B",
	CtrlE: "CTRL_E",
	CtrlW: "CTRL_W",
	AltP: "ALT_P",
	CtrlEnter: "CTRL_ENTER",
	Enter: "ENTER",
	Escape: "ESC",
	Delete: "DELETE",
	Backspace: "BACKSPACE",
	Tab: "TAB",
	ShiftTab: "SHIFT_TAB",
	Up: "UP",
	Down: "DOWN",
	Left: "LEFT",
	Right: "RIGHT",
	PageUp: "PAGE_UP",
	PageDown: "PAGE_DOWN",
	Home: "HOME",
	End: "END",
} as const;

export type SpecialKey = (typeof SpecialKeys)[keyof typeof SpecialKeys];

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
