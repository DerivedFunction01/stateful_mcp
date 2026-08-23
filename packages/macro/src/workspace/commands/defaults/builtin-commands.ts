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
		// Editor File & Document Operations
		{
			command: "editor.save",
			titleI18nKey: "menu.save",
			categoryI18nKey: "common.editor",
			verb: "write",
			defaultAliases: ["w"],
		},
		{
			command: "editor.saveAll",
			titleI18nKey: "workspace.saveAll",
			categoryI18nKey: "common.editor",
			verb: "wall",
			defaultAliases: ["wa"],
		},
		{
			command: "editor.saveAndClose",
			titleI18nKey: "workspace.saveActiveAndClose",
			categoryI18nKey: "common.editor",
			verb: "wq",
		},
		{
			command: "editor.closeDocument",
			titleI18nKey: "editor.document.close",
			categoryI18nKey: "common.editor",
			verb: "quit",
			defaultAliases: ["q", "tabclose", "close"],
		},
		{
			command: "editor.closeAll",
			titleI18nKey: "workspace.quitAll",
			categoryI18nKey: "common.editor",
			verb: "quitall",
			defaultAliases: ["qa"],
		},
		{
			command: "editor.newScratchpad",
			titleI18nKey: "editor.document.new",
			categoryI18nKey: "common.editor",
			verb: "new",
			defaultAliases: ["tabnew", "newtab", "scratchpad"],
		},
		{
			command: "editor.duplicateDocument",
			titleI18nKey: "editor.document.duplicate",
			categoryI18nKey: "common.editor",
			verb: "duplicate",
			defaultAliases: ["dup", "copy"],
		},
		{
			command: "editor.createSplitGroup",
			titleI18nKey: "editor.group.split",
			categoryI18nKey: "common.editor",
			verb: "split",
			defaultAliases: ["vsplit", "sp", "vs"],
		},
		{
			command: "editor.closeGroup",
			titleI18nKey: "editor.split.closeGroup",
			categoryI18nKey: "common.editor",
			verb: "only",
			defaultAliases: ["closegroup"],
		},

		// Editor Execution & Search
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
			verb: "open",
			defaultAliases: ["edit", "e"],
		},
		{
			command: "workbench.openSettings",
			titleI18nKey: "workbench.openSettings",
			categoryI18nKey: "common.workspace",
			verb: "settings",
			defaultAliases: ["config", "preferences"],
		},
		{
			command: "workbench.toggleSidepanel",
			titleI18nKey: "menu.toggleSidepanel",
			categoryI18nKey: "menu.view",
		},
		{
			command: "workbench.toggleActivity",
			titleI18nKey: "workbench.toggleActivityPanel",
			categoryI18nKey: "menu.view",
		},
		{
			command: "workbench.toggleDrawer",
			titleI18nKey: "workbench.toggleDrawer",
			categoryI18nKey: "menu.view",
		},
		{
			command: "workbench.openProject",
			titleI18nKey: "menu.openProject",
			categoryI18nKey: "common.workspace",
			verb: "openproject",
		},
		{
			command: "workbench.saveAsProject",
			titleI18nKey: "menu.saveAsProject",
			categoryI18nKey: "common.workspace",
			verb: "saveproject",
		},
		{
			command: "workspace.openExtensions",
			titleI18nKey: "workspace.openExtensions",
			categoryI18nKey: "common.workspace",
			verb: "extensions",
			defaultAliases: ["plugins"],
		},
	];
