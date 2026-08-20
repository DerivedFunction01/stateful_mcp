export interface BuiltinCommandDefinition {
	readonly command: string;
	readonly title: string;
	readonly category: string;
	readonly verb?: string;
	readonly defaultAliases?: readonly string[];
	readonly description?: string;
}

/**
 * Authoritative canonical built-in command catalog.
 * Defines canonical command IDs, titles, categories, Vim Ex-command verbs, and default aliases.
 * User-configured and extension-contributed aliases layer on top of these canonical definitions.
 */
export const BUILTIN_COMMAND_DEFINITIONS: readonly BuiltinCommandDefinition[] = [
	// Workspace & Session
	{
		command: "workspace.saveActive",
		title: "Save Active Tab",
		category: "Workspace",
		verb: "write",
		defaultAliases: ["w"],
		description: "Save active document changes to storage.",
	},
	{
		command: "workspace.saveAll",
		title: "Save All Tabs",
		category: "Workspace",
		verb: "wall",
		defaultAliases: ["wa"],
		description: "Save all open modified documents.",
	},
	{
		command: "workspace.saveActiveAndClose",
		title: "Save and Close",
		category: "Workspace",
		verb: "wq",
		description: "Save active document and close its tab.",
	},
	{
		command: "workspace.saveAllAndQuit",
		title: "Save All and Quit",
		category: "Workspace",
		verb: "wqa",
		description: "Save all open documents and quit the session.",
	},
	{
		command: "workspace.quit",
		title: "Quit Application",
		category: "Workspace",
		verb: "quit",
		defaultAliases: ["q"],
		description: "Exit the active workspace session.",
	},
	{
		command: "workspace.quitAll",
		title: "Quit All",
		category: "Workspace",
		verb: "quitall",
		defaultAliases: ["qa"],
		description: "Close all workspaces and quit.",
	},
	{
		command: "workspace.closeActiveTab",
		title: "Close Active Tab",
		category: "Workspace",
		verb: "tabclose",
		description: "Close current active workspace tab.",
	},
	{
		command: "workspace.openSettings",
		title: "Open Settings",
		category: "Workspace",
		verb: "settings",
		defaultAliases: ["config"],
		description: "Open the configuration and settings panel.",
	},
	{
		command: "workspace.closeSettings",
		title: "Close Settings",
		category: "Workspace",
		description: "Dismiss the settings panel.",
	},
	{
		command: "workspace.toggleSettings",
		title: "Toggle Settings",
		category: "Workspace",
		description: "Toggle settings panel visibility.",
	},
	{
		command: "workspace.openExtensions",
		title: "Open Extensions",
		category: "Workspace",
		verb: "extensions",
		description: "Open extensions and plugin manager.",
	},

	// Editor Execution & Operations
	{
		command: "editor.executeLine",
		title: "Execute Macro Line",
		category: "Editor",
		description: "Execute macro line at cursor or specified line.",
	},
	{
		command: "editor.executeRange",
		title: "Execute Macro Range",
		category: "Editor",
		description: "Execute macro lines across the given range.",
	},
	{
		command: "editor.executeValidLines",
		title: "Execute Valid Macro Lines",
		category: "Editor",
		description: "Execute all valid executable macro lines in document.",
	},
	{
		command: "editor.splitGroup",
		title: "Split Editor Right",
		category: "Editor",
		description: "Split the active document into a side editor group.",
	},
	{
		command: "editor.newScratchpad",
		title: "New Scratchpad Document",
		category: "Editor",
		description: "Create a new scratchpad buffer in the active group.",
	},

	// Workbench & Navigation
	{
		command: "workbench.commandPalette",
		title: "Command Palette",
		category: "Workbench",
		description: "Open the command palette omnibar.",
	},
	{
		command: "workbench.quickOpen",
		title: "Go to File / Quick Open",
		category: "Workbench",
		description: "Quickly open files and documents by name.",
	},
	{
		command: "workspace.toggleSidepanel",
		title: "Toggle Sidepanel Visibility",
		category: "View",
		description: "Show or hide the secondary sidebar panel.",
	},
	{
		command: "workbench.toggleDrawer",
		title: "Toggle Output Drawer",
		category: "View",
		description: "Show or hide the bottom output/journal drawer.",
	},
];
