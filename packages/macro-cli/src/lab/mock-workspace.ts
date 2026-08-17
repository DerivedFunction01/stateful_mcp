import {
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	type MacroWorkspace,
} from "@stateful-mcp/macro";
import { registerCliLocales } from "../locales";

export interface MockWorkspaceOptions {
	readonly initialText?: string;
	readonly locale?: string;
	readonly keymap?: EditorKeymapProfile;
}

export function createMockWorkspace(options: MockWorkspaceOptions = {}): {
	workspace: MacroWorkspace;
	keymap: EditorKeymapProfile;
} {
	const keymap = options.keymap ?? DEFAULT_EDITOR_KEYMAP_PROFILE;
	const workspace = createMacroWorkspace({
		initialText:
			options.initialText ??
			'^echo message="Hello Component Lab"\n^deploy service=api env=staging\nplain text item',
		initialLocale: options.locale ?? "en",
	});
	registerCliLocales(workspace.i18n);

	// Register core sample commands into palette
	workspace.commands.registerCommand(
		{
			command: "workspace.switchSession",
			title: "Switch session",
			category: "Suggested",
			keybinding: "ctrl+x l",
		},
		{ execute: () => "switched" },
	);

	workspace.commands.registerCommand(
		{
			command: "workspace.switchModel",
			title: "Switch model",
			category: "Suggested",
			keybinding: "ctrl+x m",
		},
		{ execute: () => "switched" },
	);

	workspace.commands.registerCommand(
		{
			command: "system.hideTips",
			title: "Hide tips",
			category: "System",
			keybinding: "ctrl+x h",
		},
		{ execute: () => "hidden" },
	);

	workspace.commands.registerCommand(
		{
			command: "system.plugins",
			title: "Plugins",
			category: "System",
		},
		{ execute: () => "plugins" },
	);

	workspace.commands.registerCommand(
		{
			command: "system.viewStatus",
			title: "View status",
			category: "System",
			keybinding: "ctrl+x s",
		},
		{ execute: () => "status" },
	);

	workspace.commands.registerCommand(
		{
			command: "system.toggleSidepanel",
			title: "Toggle debug panel",
			category: "System",
			keybinding: "ctrl+b",
		},
		{ execute: () => workspace.layout.toggleSidepanel() },
	);

	return {
		workspace,
		keymap,
	};
}
