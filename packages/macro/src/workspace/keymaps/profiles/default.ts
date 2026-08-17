import { type EditorKeymapProfile, SpecialKeys } from "../types";

/**
 * Standard default keymap profile for Macro Workspace (Vim-inspired).
 * This declarative configuration can be edited directly or ejected into .macro/keymap.json.
 */
export const DEFAULT_EDITOR_KEYMAP_PROFILE: EditorKeymapProfile = {
	profileId: "default",
	name: "Standard Vim Modal",
	description:
		"Standard Vim modal keybindings with Quick Open omnibar and activity bar navigation",
	normal: {
		moveDown: "j",
		moveUp: "k",
		moveLeft: "h",
		moveRight: "l",
		enterInsert: "i",
		insertBelow: "o",
		insertAbove: "O",
		enterVisual: "v",
		pasteBelow: "p",
		previewCell: "P",
		runCell: "r",
		undo: "u",
		redo: SpecialKeys.CtrlR,
		command: ":",
		macro: "^",
		search: "s",
		searchAlt: "/",
		info: "I",
		quit: "q",
	},
	sequences: {
		deleteCell: "dd",
		yankCell: "yy",
		previousError: "[e",
		nextError: "]e",
		workspace: "gw",
		pasteAbove: "gp",
	},
	visual: {
		deleteSelection: "d",
		yankSelection: "y",
		pasteSelection: "p",
		extendDown: "j",
		extendUp: "k",
		extendLeft: "h",
		extendRight: "l",
		swapAnchor: "o",
	},
	window: {
		toggleSidepanel: SpecialKeys.CtrlB,
		toggleActivityPanel: SpecialKeys.CtrlE,
		switchSplitFocus: SpecialKeys.CtrlW,
		openCommandPalette: SpecialKeys.CtrlP,
		nextTab: SpecialKeys.Tab,
		prevTab: SpecialKeys.ShiftTab,
		pinMacro: SpecialKeys.AltP,
	},
};
