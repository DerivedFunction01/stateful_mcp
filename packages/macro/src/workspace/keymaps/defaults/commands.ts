import type { WorkspaceKeybinding } from "../types";

/**
 * Canonical default command keybindings aligned with modern VS Code standards.
 * Dedicated modal motions (Vim) are routed through the vim section in the keymap profile.
 */
export const DEFAULT_COMMAND_KEYBINDINGS: readonly WorkspaceKeybinding[] = [
	// Editor Operations
	{
		command: "editor.save",
		chords: ["ctrl+s"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.save",
	},
	{
		command: "editor.executeLine",
		chords: ["enter", "r"],
		modes: ["NORMAL", "VISUAL"],
		labelI18nKey: "command.editor.executeLine",
	},
	{
		command: "editor.splitLine",
		chords: ["enter"],
		modes: ["INSERT"],
		labelI18nKey: "command.editor.splitLine",
	},
	{
		command: "editor.insertLineBreak",
		chords: ["shift+enter"],
		modes: ["INSERT"],
		labelI18nKey: "command.editor.insertLineBreak",
	},
	{
		command: "editor.insertTab",
		chords: ["tab"],
		modes: ["INSERT"],
		labelI18nKey: "command.editor.insertTab",
	},
	{
		command: "editor.splitGroup",
		chords: ["ctrl+\\"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.splitGroup",
	},
	{
		command: "editor.nextTab",
		chords: ["ctrl+pagedown"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.nextTab",
	},
	{
		command: "editor.prevTab",
		chords: ["ctrl+pageup"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.prevTab",
	},

	// Workbench & Navigation (VS Code Aligned)
	{
		command: "workbench.commandPalette",
		chords: ["ctrl+shift+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.commandPalette",
	},
	{
		command: "workbench.quickOpen",
		chords: ["ctrl+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.quickOpen",
	},
	{
		command: "workspace.toggleSidepanel",
		chords: ["ctrl+b"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workspace.toggleSidepanel",
	},
	{
		command: "workbench.toggleDrawer",
		chords: ["ctrl+`"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.toggleDrawer",
	},
	{
		command: "workbench.openSettings",
		chords: ["ctrl+,"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.openSettings",
	},
	{
		command: "editor.pinMacro",
		chords: ["meta+p"],
		modes: ["NORMAL", "VISUAL"],
		labelI18nKey: "command.editor.pinMacro",
	},
];
