import type { WorkspaceKeybinding } from "./types";

/**
 * The sole source of built-in action chords. Components and extensions may
 * register behavior, but never define local default key variants.
 */
export const DEFAULT_COMMAND_KEYBINDINGS: readonly WorkspaceKeybinding[] = [
	{
		command: "cursor.moveDown",
		chords: ["j", "down"],
		modes: ["NORMAL", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.cursor.moveDown",
	},
	{
		command: "cursor.moveUp",
		chords: ["k", "up"],
		modes: ["NORMAL", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.cursor.moveUp",
	},
	{
		command: "cursor.moveLeft",
		chords: ["h", "left"],
		modes: ["NORMAL", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.cursor.moveLeft",
	},
	{
		command: "cursor.moveRight",
		chords: ["l", "right"],
		modes: ["NORMAL", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.cursor.moveRight",
	},
	{
		command: "cursor.pageDown",
		chords: ["pagedown"],
		modes: ["NORMAL", "VISUAL"],
		labelI18nKey: "command.cursor.pageDown",
	},
	{
		command: "cursor.pageUp",
		chords: ["pageup"],
		modes: ["NORMAL", "VISUAL"],
		labelI18nKey: "command.cursor.pageUp",
	},
	{
		command: "editor.save",
		chords: ["ctrl+s"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.editor.save",
	},
	{
		command: "editor.close",
		chords: ["escape"],
		modes: ["NORMAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.editor.close",
	},
	{
		command: "editor.executeLine",
		chords: ["enter", "r"],
		modes: ["NORMAL", "VISUAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.editor.executeLine",
	},
	{
		command: "editor.switchTab",
		chords: ["tab", "shift+tab"],
		modes: ["NORMAL"],
		when: { not: { key: "activeTabId", equals: "settings" } },
		labelI18nKey: "command.editor.switchTab",
	},
	{
		command: "workspace.quit",
		chords: ["ctrl+c"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workspace.quit",
	},
	{
		command: "settings.navigateDown",
		chords: ["j", "down"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.navigateDown",
	},
	{
		command: "settings.navigateUp",
		chords: ["k", "up"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.navigateUp",
	},
	{
		command: "settings.focusNavigation",
		chords: ["h", "left"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.focusNavigation",
	},
	{
		command: "settings.focusContent",
		chords: ["l", "right"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.focusContent",
	},
	{
		command: "settings.focusSearch",
		chords: ["/"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.focusSearch",
	},
	{
		command: "settings.selectEntry",
		chords: ["enter"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.selectEntry",
	},
	{
		command: "settings.save",
		chords: ["ctrl+s"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.save",
	},
	{
		command: "settings.back",
		chords: ["escape"],
		modes: ["NORMAL"],
		when: { key: "activeTabId", equals: "settings" },
		labelI18nKey: "command.settings.back",
	},
	{
		command: "workspace.openSettings",
		chords: ["ctrl+,", "meta+,"],
		modes: ["NORMAL", "INSERT", "VISUAL"],
		labelI18nKey: "command.workspace.openSettings",
	},
];
