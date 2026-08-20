import type { EditorKeymapProfile } from "../types";
import { DEFAULT_COMMAND_ALIASES } from "./aliases";
import { DEFAULT_COMMAND_KEYBINDINGS } from "./commands";

const NORMAL_BINDINGS = {
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
	redo: "ctrl+r",
	command: ":",
	macro: "^",
	search: "s",
	searchAlt: "/",
	info: "I",
	quit: "q",
} as const;

const SEQUENCE_BINDINGS = {
	deleteCell: "dd",
	yankCell: "yy",
	previousError: "[e",
	nextError: "]e",
	workspace: "gw",
	pasteAbove: "gp",
} as const;

const VISUAL_BINDINGS = {
	deleteSelection: "d",
	yankSelection: "y",
	pasteSelection: "p",
	extendDown: "j",
	extendUp: "k",
	extendLeft: "h",
	extendRight: "l",
	swapAnchor: "o",
} as const;

const WORKBENCH_BINDINGS = {
	openCommandPalette: "ctrl+shift+p",
	quickOpen: "ctrl+p",
	openSettings: "ctrl+,",
	toggleSidepanel: "ctrl+b",
	toggleDrawer: "ctrl+`",
	splitGroup: "ctrl+\\",
	switchSplitFocus: "ctrl+w",
	nextTab: "ctrl+pagedown",
	prevTab: "ctrl+pageup",
	pinMacro: "meta+p",
} as const;

/**
 * Standard default keymap profile for Macro Workspace using strict canonical chords.
 * Organized into explicit domain sections: vim, workbench, and global keybindings.
 */
export const DEFAULT_EDITOR_KEYMAP_PROFILE: EditorKeymapProfile = {
	profileId: "default",
	name: "Standard Vim Modal",
	description:
		"Standard Vim modal keybindings with Quick Open omnibar and activity bar navigation",
	vim: {
		normal: NORMAL_BINDINGS,
		visual: VISUAL_BINDINGS,
		sequences: SEQUENCE_BINDINGS,
	},
	workbench: WORKBENCH_BINDINGS,
	normal: NORMAL_BINDINGS,
	sequences: SEQUENCE_BINDINGS,
	visual: VISUAL_BINDINGS,
	window: WORKBENCH_BINDINGS,
	keybindings: Object.fromEntries(
		DEFAULT_COMMAND_KEYBINDINGS.map((binding) => [
			binding.command,
			binding.chords,
		]),
	),
	aliases: DEFAULT_COMMAND_ALIASES,
};
