import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { EditorExtension } from "./extension";

/** Core editor mode transitions and basic text editing. */
export const coreEditorExtension: EditorExtension = {
	id: "editor.core",
	windows: ["notebook", "workspace", "plan"],
	keybindings: [
		{
			id: "editor.enterInsert",
			key: "i",
			modes: ["NORMAL"],
			intentType: "editor.enterInsert",
		},
		{
			id: "editor.append",
			key: "a",
			modes: ["NORMAL"],
			intentType: "editor.enterInsert",
		},
		{
			id: "editor.command",
			key: ":",
			modes: ["NORMAL"],
			intentType: "editor.enterCommand",
		},
	],
};

/** Command input: completion, history, submission. */
export const commandInputExtension: EditorExtension = {
	id: "editor.commandInput",
	windows: ["notebook", "workspace", "plan"],
	keybindings: [
		{
			id: "command.next",
			key: "tab",
			modes: ["COMMAND"],
			intentType: "command.complete.next",
		},
		{
			id: "command.prev",
			key: "tab",
			modifiers: ["shift"],
			modes: ["COMMAND"],
			intentType: "command.complete.prev",
		},
		{
			id: "command.up",
			key: "up",
			modes: ["COMMAND"],
			intentType: "command.history.prev",
		},
		{
			id: "command.down",
			key: "down",
			modes: ["COMMAND"],
			intentType: "command.history.next",
		},
		{
			id: "command.submit",
			key: "enter",
			modes: ["COMMAND"],
			intentType: "command.submit",
		},
	],
};

const NV = ["NORMAL", "VISUAL"] as EditorMode[];

/** Cell document navigation and manipulation. */
export const cellDocumentExtension: EditorExtension = {
	id: "document.cell",
	windows: ["notebook", "workspace"],
	keybindings: [
		{
			id: "cell.down",
			key: "j",
			modes: ["NORMAL"],
			intentType: "document.moveDown",
		},
		{
			id: "cell.up",
			key: "k",
			modes: ["NORMAL"],
			intentType: "document.moveUp",
		},
		{
			id: "cell.run",
			key: "r",
			modes: ["NORMAL", "VISUAL"],
			intentType: "cell.run",
		},
		{
			id: "cell.preview",
			key: "P",
			modes: ["NORMAL"],
			intentType: "cell.preview",
		},
		{
			id: "cell.delete",
			key: "dd",
			modes: ["NORMAL"],
			intentType: "document.deleteActive",
		},
		{
			id: "cell.yank",
			key: "yy",
			modes: ["NORMAL"],
			intentType: "document.yankActive",
		},
		{
			id: "cell.paste",
			key: "p",
			modes: ["NORMAL"],
			intentType: "document.paste",
		},
		{
			id: "cell.undo",
			key: "u",
			modes: ["NORMAL"],
			intentType: "document.undo",
		},
		{
			id: "cell.redo",
			key: "r",
			modifiers: ["ctrl"],
			modes: NV,
			intentType: "document.redo",
		},
		{
			id: "cell.insertBelow",
			key: "o",
			modes: ["NORMAL"],
			intentType: "document.insertBelow",
		},
		{
			id: "cell.insertAbove",
			key: "O",
			modes: ["NORMAL"],
			intentType: "document.insertAbove",
		},
		{
			id: "cell.visual",
			key: "V",
			modes: ["NORMAL"],
			intentType: "document.enterVisual",
		},
	],
};

/** Visual selection. */
export const visualSelectionExtension: EditorExtension = {
	id: "document.visual",
	windows: ["notebook", "workspace"],
	keybindings: [
		{
			id: "visual.down",
			key: "j",
			modes: ["VISUAL"],
			intentType: "document.extendDown",
		},
		{
			id: "visual.up",
			key: "k",
			modes: ["VISUAL"],
			intentType: "document.extendUp",
		},
		{
			id: "visual.delete",
			key: "d",
			modes: ["VISUAL"],
			intentType: "document.deleteSelection",
		},
		{
			id: "visual.yank",
			key: "y",
			modes: ["VISUAL"],
			intentType: "document.yankSelection",
		},
	],
};

export const builtinExtensions: EditorExtension[] = [
	coreEditorExtension,
	commandInputExtension,
	cellDocumentExtension,
	visualSelectionExtension,
];
