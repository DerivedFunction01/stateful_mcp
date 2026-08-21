import type { WorkspaceKeybinding } from "../types";

/**
 * Canonical default command keybindings aligned with modern VS Code standards.
 * Dedicated modal motions (Vim) are routed through the vim section in the keymap profile.
 */
export const DEFAULT_COMMAND_KEYBINDINGS: readonly WorkspaceKeybinding[] = [
	// Editor Operations
	{
		command: "editor.save",
		chords: ["primary+s"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.save",
	},
	{
		command: "editor.find",
		chords: ["primary+f"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.find",
	},
	{
		command: "editor.replace",
		chords: ["primary+shift+f"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.replace",
	},
	{
		command: "editor.executeLine",
		chords: ["primary+enter"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.executeLine",
	},
	{
		command: "editor.executeValidLines",
		chords: ["primary+shift+enter"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.executeValidLines",
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
		chords: ["primary+\\"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.splitGroup",
	},
	{
		command: "editor.nextTab",
		chords: ["primary+pagedown"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.nextTab",
	},
	{
		command: "editor.prevTab",
		chords: ["primary+pageup"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.editor.prevTab",
	},

	// Workbench & Navigation (VS Code Aligned)
	{
		command: "workbench.commandPalette",
		chords: ["primary+shift+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.commandPalette",
	},
	{
		command: "workbench.quickOpen",
		chords: ["primary+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.quickOpen",
	},
	{
		command: "workspace.toggleSidepanel",
		chords: ["primary+b"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workspace.toggleSidepanel",
	},
	{
		command: "workbench.toggleDrawer",
		chords: ["primary+`"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.toggleDrawer",
	},
	{
		command: "workbench.openSettings",
		chords: ["primary+,"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workbench.openSettings",
	},
];
