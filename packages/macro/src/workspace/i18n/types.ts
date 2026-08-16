/**
 * Typed interface for workspace and shell localization dictionaries.
 */

export interface WorkspaceLocaleDictionary {
	readonly "shell.mode.normal": string;
	readonly "shell.mode.insert": string;
	readonly "shell.mode.visual": string;
	readonly "shell.mode.command": string;
	readonly "shell.diagnostics.valid": string;
	readonly "shell.diagnostics.errors": string;
	readonly "workspace.tab.scratchpad": string;
	readonly "workspace.tab.notebook": string;
	readonly "workspace.tab.settings": string;
	readonly "sidepanel.slots.title": string;
	readonly "sidepanel.journal.title": string;
	readonly "sidepanel.explorer.title": string;
	readonly "palette.title": string;
	readonly "palette.placeholder": string;
	readonly [key: string]: string;
}
