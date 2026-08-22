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
		labelI18nKey: "menu.save",
	},
	{
		command: "editor.find",
		chords: ["primary+f"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.find.findAction",
	},
	{
		command: "editor.replace",
		chords: ["primary+shift+f"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.find.replaceAction",
	},
	{
		command: "editor.executeLine",
		chords: ["primary+enter"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.execution.line",
	},
	{
		command: "editor.executeValidLines",
		chords: ["primary+shift+enter"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.execution.validLines",
	},
	{
		command: "editor.executeLine",
		chords: ["enter", "r"],
		modes: ["NORMAL", "VISUAL"],
		labelI18nKey: "editor.execution.line",
	},
	{
		command: "editor.splitLine",
		chords: ["enter"],
		modes: ["INSERT"],
		labelI18nKey: "editor.splitLine",
	},
	{
		command: "editor.insertLineBreak",
		chords: ["shift+enter"],
		modes: ["INSERT"],
		labelI18nKey: "editor.insertLineBreak",
	},
	{
		command: "editor.insertTab",
		chords: ["tab"],
		modes: ["INSERT"],
		labelI18nKey: "editor.insertTab",
	},
	{
		command: "editor.splitGroup",
		chords: ["primary+\\"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.group.split",
	},
	{
		command: "editor.nextTab",
		chords: ["primary+pagedown"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.nextTab",
	},
	{
		command: "editor.prevTab",
		chords: ["primary+pageup"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "editor.prevTab",
	},

	// Workbench & Navigation (VS Code Aligned)
	{
		command: "workbench.commandPalette",
		chords: ["primary+shift+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "palette.title",
	},
	{
		command: "workbench.quickOpen",
		chords: ["primary+p"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workbench.quickOpen",
	},
	{
		command: "workbench.openProject",
		chords: ["primary+o"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workbench.openProjectTitle",
	},
	{
		command: "workbench.saveAsProject",
		chords: ["primary+shift+s"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workbench.saveAsProjectTitle",
	},
	{
		command: "workspace.saveAll",
		chords: ["primary+alt+s"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workspace.saveAll",
	},
	{
		command: "workspace.toggleSidepanel",
		chords: ["primary+b"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "menu.toggleSidepanel",
	},
	{
		command: "workbench.toggleDrawer",
		chords: ["primary+`"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workbench.toggleDrawer",
	},
	{
		command: "workbench.openSettings",
		chords: ["primary+,"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "workbench.openSettings",
	},
];
