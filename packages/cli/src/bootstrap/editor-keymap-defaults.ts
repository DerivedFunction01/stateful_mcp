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
