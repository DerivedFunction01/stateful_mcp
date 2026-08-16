import { CommandRegistry } from "./contributions/command-registry";
import { TabRegistry } from "./contributions/tab-registry";
import { ViewRegistry } from "./contributions/view-registry";
import { EditorKernel } from "./editor/editor-kernel";
import { createDefaultI18nKernel } from "./i18n/discovery";
import type { I18nKernel } from "./i18n/i18n-kernel";
import { WorkspaceJournal } from "./journal/workspace-journal";
import {
	WindowLayoutStateManager,
	type WindowLayoutStateSnapshot,
} from "./layout/window-layout-state";
import { CommandPaletteController } from "./palette/command-palette";

export * from "./config/config-resolver";
export * from "./config/ejection-manager";
export * from "./contributions/command-registry";
export * from "./contributions/tab-registry";
export * from "./contributions/types";
export * from "./contributions/view-registry";
export * from "./editor/chips";
export * from "./editor/cursor-buffer";
export * from "./editor/editor-kernel";
export * from "./editor/vim-motions";
export * from "./i18n/discovery";
export * from "./i18n/i18n-kernel";
export * from "./journal/workspace-journal";
export * from "./keymaps";
export * from "./layout/persistence";
export * from "./layout/window-layout-state";
export * from "./palette/command-palette";
export * from "./scratchpad/live-projection";
export * from "./scratchpad/scratchpad-session";

export interface MacroWorkspaceOptions {
	readonly initialText?: string;
	readonly initialLocale?: string;
	readonly initialLayout?: Partial<WindowLayoutStateSnapshot>;
}

export interface MacroWorkspace {
	readonly layout: WindowLayoutStateManager;
	readonly editor: EditorKernel;
	readonly palette: CommandPaletteController;
	readonly journal: WorkspaceJournal;
	readonly tabs: TabRegistry;
	readonly views: ViewRegistry;
	readonly commands: CommandRegistry;
	readonly i18n: I18nKernel;
}

export function createMacroWorkspace(
	options?: MacroWorkspaceOptions,
): MacroWorkspace {
	const tabs = new TabRegistry();
	const views = new ViewRegistry();
	const commands = new CommandRegistry();
	const journal = new WorkspaceJournal();
	const i18n = createDefaultI18nKernel(options?.initialLocale ?? "en");

	const layout = new WindowLayoutStateManager(
		tabs,
		views,
		options?.initialLayout,
	);
	const editor = new EditorKernel(options?.initialText ?? "");
	const palette = new CommandPaletteController(commands, layout, tabs);

	return {
		layout,
		editor,
		palette,
		journal,
		tabs,
		views,
		commands,
		i18n,
	};
}
