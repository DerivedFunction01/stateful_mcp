import {
	SpecialKeys,
	type EditorKeymapProfile,
} from "../lib/editor/editor-keymap-profile";

export const defaultEditorKeymapProfile: EditorKeymapProfile = {
	profileId: "cli-default",
	normal: {
		moveDown: "j",
		moveUp: "k",
		enterInsert: "i",
		insertBelow: "o",
		insertAbove: "O",
		enterVisual: "V",
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
		swapAnchor: "o",
	},
};

export const editorKeymapHelpGroups = [
	{
		labelKey: "help.keyGroup.normal",
		bindings: [
			["moveDown", "moveUp"],
			["enterInsert", "insertBelow", "insertAbove"],
			["enterVisual"],
			["pasteBelow"],
			["previewCell"],
			["runCell"],
			["undo"],
			["redo"],
			["command"],
			["macro"],
			["search", "searchAlt"],
			["info"],
			["quit"],
		] as const,
	},
	{
		labelKey: "help.keyGroup.sequences",
		bindings: [["deleteCell"], ["yankCell"], ["previousError"], ["nextError"], ["workspace"], ["pasteAbove"]] as const,
	},
	{
		labelKey: "help.keyGroup.visual",
		bindings: [["deleteSelection"], ["yankSelection"], ["pasteSelection"], ["extendDown", "extendUp"], ["swapAnchor"]] as const,
	},
] as const;

export function mergeEditorKeymap(
	base: EditorKeymapProfile,
	override: Partial<EditorKeymapProfile> | undefined,
): EditorKeymapProfile {
	if (!override) return base;
	return {
		profileId: override.profileId ?? base.profileId,
		normal: { ...base.normal, ...override.normal },
		sequences: { ...base.sequences, ...override.sequences },
		visual: { ...base.visual, ...override.visual },
	};
}
