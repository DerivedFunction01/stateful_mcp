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
	search: "/",
	searchAlt: "?",
	nextMatch: "n",
	previousMatch: "N",
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
	openCommandPalette: "primary+shift+p",
	quickOpen: "primary+p",
	openSettings: "primary+,",
	toggleSidepanel: "primary+b",
	toggleDrawer: "primary+`",
	splitGroup: "primary+\\",
	switchSplitFocus: "primary+w",
	nextTab: "primary+pagedown",
	prevTab: "primary+pageup",
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
	keybindings: DEFAULT_COMMAND_KEYBINDINGS.reduce<
		Record<string, readonly string[]>
	>((acc, binding) => {
		acc[binding.command] = [
			...new Set([...(acc[binding.command] ?? []), ...binding.chords]),
		];
		return acc;
	}, {}),
	aliases: DEFAULT_COMMAND_ALIASES,
};
