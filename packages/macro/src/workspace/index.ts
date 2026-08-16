import type { UserMacroProfile } from "../contracts/extension-config";
import { ExtensionRuntime } from "../extensions/runtime";
import { CommandRegistry } from "./contributions/command-registry";
import { ExtensionContributionManager } from "./contributions/extension-contribution-manager";
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
import { ScratchpadSession, type ScratchpadSessionOptions } from "./scratchpad/scratchpad-session";

export * from "./config/config-resolver";
export * from "./config/ejection-manager";
export * from "./contributions/command-registry";
export * from "./contributions/extension-contribution-manager";
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
	readonly runtime?: ExtensionRuntime;
	readonly profile?: UserMacroProfile;
	readonly journal?: import("./journal/workspace-journal").WorkspaceJournalOptions;
	readonly scratchpad?: ScratchpadSessionOptions;
}

export interface MacroWorkspace {
	readonly layout: WindowLayoutStateManager;
	readonly editor: EditorKernel;
	readonly scratchpad: ScratchpadSession;
	readonly palette: CommandPaletteController;
	readonly journal: WorkspaceJournal;
	readonly tabs: TabRegistry;
	readonly views: ViewRegistry;
	readonly commands: CommandRegistry;
	readonly i18n: I18nKernel;
	readonly runtime: ExtensionRuntime;
	readonly contributions: ExtensionContributionManager;
	dispose(): Promise<void>;
}

export function createMacroWorkspace(
	options?: MacroWorkspaceOptions,
): MacroWorkspace {
	const tabs = new TabRegistry();
	const views = new ViewRegistry();
	const commands = new CommandRegistry();
	const journal = new WorkspaceJournal(options?.journal);
	const i18n = createDefaultI18nKernel(options?.initialLocale ?? "en");
	const runtime =
		options?.runtime ??
		new ExtensionRuntime({ profile: options?.profile, i18n });

	const layout = new WindowLayoutStateManager(
		tabs,
		views,
		options?.initialLayout,
	);
	const editor = new EditorKernel(options?.initialText ?? "");
	const scratchpad = new ScratchpadSession(runtime, editor.buffer, 50, options?.scratchpad);
	const palette = new CommandPaletteController(commands, layout, tabs);
	const contributions = new ExtensionContributionManager(views, tabs, commands);
	const workspace: MacroWorkspace = {
		layout,
		editor,
		scratchpad,
		palette,
		journal,
		tabs,
		views,
		commands,
		i18n,
		runtime,
		contributions,
		dispose: async () => {
			contributions.dispose();
			await runtime.dispose();
		},
	};

	return workspace;
}
