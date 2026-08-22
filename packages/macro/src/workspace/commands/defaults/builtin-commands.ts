export interface BuiltinCommandDefinition {
	readonly command: string;
	readonly titleI18nKey?: string;
	readonly categoryI18nKey?: string;
	readonly verb?: string;
	readonly defaultAliases?: readonly string[];
	readonly descriptionI18nKey?: string;
}

/**
 * Authoritative canonical built-in command catalog.
 * Defines canonical command IDs, title i18n keys, category i18n keys, Vim Ex-command verbs, and default aliases.
 * User-configured and extension-contributed aliases layer on top of these canonical definitions.
 */
export const BUILTIN_COMMAND_DEFINITIONS: readonly BuiltinCommandDefinition[] =
	[
		// Workspace & Session
		{
			command: "workspace.saveActive",
			titleI18nKey: "menu.save",
			categoryI18nKey: "common.workspace",
			verb: "write",
			defaultAliases: ["w"],
		},
		{
			command: "workspace.saveAll",
			titleI18nKey: "workspace.saveAll",
			categoryI18nKey: "common.workspace",
			verb: "wall",
			defaultAliases: ["wa"],
		},
		{
			command: "workspace.saveActiveAndClose",
			titleI18nKey: "workspace.saveActiveAndClose",
			categoryI18nKey: "common.workspace",
			verb: "wq",
		},
		{
			command: "workspace.saveAllAndQuit",
			titleI18nKey: "workspace.saveAllAndQuit",
			categoryI18nKey: "common.workspace",
			verb: "wqa",
		},
		{
			command: "workspace.quit",
			titleI18nKey: "workspace.quit",
			categoryI18nKey: "common.workspace",
			verb: "quit",
			defaultAliases: ["q"],
		},
		{
			command: "workspace.quitAll",
			titleI18nKey: "workspace.quitAll",
			categoryI18nKey: "common.workspace",
			verb: "quitall",
			defaultAliases: ["qa"],
		},
		{
			command: "workspace.closeActiveTab",
			titleI18nKey: "workspace.closeActiveTab",
			categoryI18nKey: "common.workspace",
			verb: "tabclose",
		},
		{
			command: "workspace.openSettings",
			titleI18nKey: "workbench.openSettings",
			categoryI18nKey: "common.workspace",
			verb: "settings",
			defaultAliases: ["config"],
		},
		{
			command: "workspace.closeSettings",
			titleI18nKey: "workspace.closeSettings",
			categoryI18nKey: "common.workspace",
		},
		{
			command: "workspace.toggleSettings",
			titleI18nKey: "workspace.toggleSettings",
			categoryI18nKey: "common.workspace",
		},
		{
			command: "workspace.openExtensions",
			titleI18nKey: "workspace.openExtensions",
			categoryI18nKey: "common.workspace",
			verb: "extensions",
		},

		// Editor Execution & Operations
		{
			command: "editor.executeLine",
			titleI18nKey: "editor.execution.line",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.executeRange",
			titleI18nKey: "editor.execution.range",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.executeValidLines",
			titleI18nKey: "editor.execution.validLines",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.splitGroup",
			titleI18nKey: "editor.group.split",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.newScratchpad",
			titleI18nKey: "editor.document.new",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.find",
			titleI18nKey: "editor.find.findAction",
			categoryI18nKey: "common.editor",
		},
		{
			command: "editor.replace",
			titleI18nKey: "editor.find.replaceAction",
			categoryI18nKey: "common.editor",
		},

		// Workbench & Navigation
		{
			command: "workbench.commandPalette",
			titleI18nKey: "palette.title",
			categoryI18nKey: "common.workspace",
		},
		{
			command: "workbench.quickOpen",
			titleI18nKey: "workbench.quickOpen",
			categoryI18nKey: "common.workspace",
		},
		{
			command: "workspace.toggleSidepanel",
			titleI18nKey: "menu.toggleSidepanel",
			categoryI18nKey: "menu.view",
		},
		{
			command: "workbench.toggleDrawer",
			titleI18nKey: "workbench.toggleDrawer",
			categoryI18nKey: "menu.view",
		},
	];
