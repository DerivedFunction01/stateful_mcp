import type { UserMacroProfile } from "../contracts/extension-config";
import { ExtensionRuntime } from "../extensions/runtime";
import { WorkspaceSaveCoordinator } from "./commands/save-coordinator";
import type { OpenSettingsRequest } from "./config/settings-navigation";
import { SettingsNavigationState } from "./config/settings-navigation";
import { WorkspaceSettingsService } from "./config/settings-service";
import { SettingsUiModel } from "./config/settings-ui-model";
import { CommandRegistry } from "./contributions/command-registry";
import { ExtensionContributionManager } from "./contributions/extension-contribution-manager";
import { SettingsContributionRegistry } from "./contributions/settings-registry";
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
import {
	ScratchpadSession,
	type ScratchpadSessionOptions,
} from "./scratchpad/scratchpad-session";

export * from "./commands/command-descriptor";
export * from "./commands/save-coordinator";
export * from "./config/bundle-manager";
export * from "./config/config-resolver";
export * from "./config/ejection-manager";
export * from "./config/profile-resolver";
export * from "./config/settings-bundle";
export * from "./config/settings-navigation";
export * from "./config/settings-projection";
export * from "./config/settings-service";
export * from "./config/settings-ui-model";
export * from "./config/storage-driver";
export * from "./contributions/command-registry";
export * from "./contributions/extension-contribution-manager";
export * from "./contributions/settings-registry";
export * from "./contributions/tab-registry";
export * from "./contributions/types";
export * from "./contributions/view-registry";
export * from "./editor/chips";
export * from "./editor/cursor-buffer";
export * from "./editor/editor-kernel";
export * from "./editor/vim-motions";
export * from "./i18n/discovery";
export * from "./i18n/i18n-kernel";
export * from "./i18n/translation";
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
	readonly settings?: WorkspaceSettingsService;
	readonly journal?: import("./journal/workspace-journal").WorkspaceJournalOptions;
	readonly scratchpad?: ScratchpadSessionOptions;
}

export interface MacroWorkspace {
	readonly profile?: UserMacroProfile;
	readonly settings?: WorkspaceSettingsService;
	readonly layout: WindowLayoutStateManager;
	readonly editor: EditorKernel;
	readonly scratchpad: ScratchpadSession;
	readonly palette: CommandPaletteController;
	readonly saveCoordinator: WorkspaceSaveCoordinator;
	readonly journal: WorkspaceJournal;
	readonly tabs: TabRegistry;
	readonly views: ViewRegistry;
	readonly commands: CommandRegistry;
	readonly i18n: I18nKernel;
	readonly runtime: ExtensionRuntime;
	readonly contributions: ExtensionContributionManager;
	readonly settingsContributions: SettingsContributionRegistry;
	readonly settingsNavigation: SettingsNavigationState;
	readonly settingsUiModel: SettingsUiModel;
	dispose(): Promise<void>;
}

export function createMacroWorkspace(
	options?: MacroWorkspaceOptions,
): MacroWorkspace {
	const tabs = new TabRegistry();
	const views = new ViewRegistry();
	const commands = new CommandRegistry();
	const settingsContributions = new SettingsContributionRegistry();
	const settingsNavigation = new SettingsNavigationState();
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
	const scratchpad = new ScratchpadSession(
		runtime,
		editor.buffer,
		50,
		options?.scratchpad,
	);
	const palette = new CommandPaletteController(commands, layout, tabs);
	const saveCoordinator = new WorkspaceSaveCoordinator(layout);
	const settingsService =
		options?.settings ??
		new WorkspaceSettingsService({
			defaults: {},
			storage: {
				read: () => null,
				write: () => undefined,
				reset: () => undefined,
			},
		});
	const settingsUiModel = new SettingsUiModel(settingsService, i18n);
	if (options?.settings) {
		let previousLocale =
			(options.settings.getEffective().uiLocale as string) ??
			(options.settings.getEffective().locale as string) ??
			options?.initialLocale ??
			"en";

		options.settings.subscribe(() => {
			const effective = options.settings!.getEffective();
			const newLocale = (effective.uiLocale ?? effective.locale) as
				| string
				| undefined;
			if (newLocale && newLocale !== previousLocale) {
				previousLocale = newLocale;
				i18n.setActiveLocale(newLocale);
			}

			runtime.applyProfile(effective as unknown as UserMacroProfile);
			void scratchpad.parseAllLines();
		});

		saveCoordinator.register({
			id: "workspace.settings",
			scope: "workspace",
			isDirty: () => options.settings!.isDirty(),
			save: async () => {
				const result = await options.settings!.save();
				return result.status === "saved"
					? {
							status: "saved",
							message: result.restartRequired ? "Restart required" : undefined,
						}
					: {
							status: "failed",
							message:
								result.status === "blocked"
									? result.diagnostics
											.map((diagnostic) => diagnostic.message)
											.join("; ")
									: "Settings revision conflict",
						};
			},
		});
	}
	commands.registerCommand(
		{
			command: "workspace.saveActive",
			title: "Save Active Tab",
			category: "Workspace",
			verb: "write",
			aliases: ["w"],
		},
		{ execute: () => saveCoordinator.saveActive() },
	);
	commands.registerCommand(
		{
			command: "workspace.saveAll",
			title: "Save All Tabs",
			category: "Workspace",
			verb: "wall",
			aliases: ["wa"],
		},
		{ execute: () => saveCoordinator.saveAll() },
	);
	commands.registerCommand(
		{
			command: "workspace.saveActiveAndClose",
			title: "Save and Close",
			category: "Workspace",
			verb: "wq",
		},
		{ execute: () => saveCoordinator.saveActiveAndClose() },
	);
	commands.registerCommand(
		{
			command: "workspace.saveAllAndQuit",
			title: "Save All and Quit",
			category: "Workspace",
			verb: "wqa",
		},
		{ execute: () => saveCoordinator.saveAllAndQuit() },
	);
	commands.registerCommand(
		{
			command: "workspace.quit",
			title: "Quit Application",
			category: "Workspace",
			verb: "quit",
			aliases: ["q"],
		},
		{ execute: () => undefined },
	);
	commands.registerCommand(
		{
			command: "workspace.quitAll",
			title: "Quit All",
			category: "Workspace",
			verb: "quitall",
			aliases: ["qa"],
		},
		{ execute: () => saveCoordinator.saveAll("quit") },
	);
	commands.registerCommand(
		{
			command: "workspace.closeActiveTab",
			title: "Close Active Tab",
			category: "Workspace",
			verb: "tabclose",
		},
		{ execute: () => layout.closeActiveTab() },
	);
	commands.registerCommand(
		{
			command: "workspace.openSettings",
			title: "Open Settings",
			category: "Workspace",
			verb: "settings",
			aliases: ["config"],
		},
		{
			execute: (request?: OpenSettingsRequest) => {
				settingsNavigation.open(request);
				layout.openModal({ id: "settings", title: "settings.title" });
			},
		},
	);
	commands.registerCommand(
		{
			command: "workspace.closeSettings",
			title: "Close Settings",
			category: "Workspace",
		},
		{
			execute: () => {
				settingsNavigation.reset();
				layout.closeModal();
			},
		},
	);
	commands.registerCommand(
		{
			command: "workspace.toggleSettings",
			title: "Toggle Settings",
			category: "Workspace",
		},
		{
			execute: () => {
				if (layout.getSnapshot().activeModal?.id === "settings") {
					settingsNavigation.reset();
					layout.closeModal();
				} else {
					settingsNavigation.open();
					layout.openModal({ id: "settings", title: "settings.title" });
				}
			},
		},
	);
	commands.registerCommand(
		{
			command: "workspace.openExtensions",
			title: "Open Extensions",
			category: "Workspace",
			verb: "extensions",
		},
		{
			execute: () => {
				layout.setActiveTab("extensions");
				layout.setFocusedPane("main");
			},
		},
	);
	commands.registerCommand(
		{
			command: "workspace.toggleSidepanel",
			title: "Toggle Sidepanel",
			category: "View",
			verb: "sidepanel",
		},
		{ execute: () => layout.toggleSidepanel() },
	);
	commands.registerCommand(
		{
			command: "layout.setRegionWidthRatio",
			title: "Set Region Width Ratio",
			category: "View",
		},
		{
			execute: (request?: {
				region?: "activity" | "inspector";
				ratio?: number;
			}) => {
				if (request?.region && typeof request.ratio === "number") {
					layout.setRegionWidthRatio(request.region, request.ratio);
				}
			},
		},
	);
	commands.registerCommand(
		{
			command: "layout.setDomainRailWidthRatio",
			title: "Set Domain Rail Width Ratio",
			category: "View",
		},
		{
			execute: (request?: { ratio?: number }) => {
				if (typeof request?.ratio === "number") {
					layout.setDomainRailWidthRatio(request.ratio);
				}
			},
		},
	);
	const contributions = new ExtensionContributionManager(
		views,
		tabs,
		commands,
		settingsContributions,
	);
	const refreshSettings = () =>
		options?.settings?.reconfigure({
			defaults: settingsContributions.getDefaults(),
			schema: settingsContributions.getSchema(),
		});
	const unsubscribeSettingsContributions =
		settingsContributions.subscribe(refreshSettings);
	refreshSettings();
	const workspace: MacroWorkspace = {
		profile: options?.profile,
		settings: options?.settings,
		layout,
		editor,
		scratchpad,
		palette,
		saveCoordinator,
		journal,
		tabs,
		views,
		commands,
		i18n,
		runtime,
		contributions,
		settingsContributions,
		settingsNavigation,
		settingsUiModel,
		dispose: async () => {
			unsubscribeSettingsContributions();
			contributions.dispose();
			await runtime.dispose();
		},
	};

	return workspace;
}
