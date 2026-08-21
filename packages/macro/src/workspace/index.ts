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
import { MacroEditorGroupManager } from "./editor/editor-group-manager";
import type { EditorKernel } from "./editor/editor-kernel";
import {
	MacroDocumentManager,
	type MacroDocumentTemplate,
} from "./editor/macro-document-manager";
import { createDefaultI18nKernel } from "./i18n/discovery";
import type { I18nKernel } from "./i18n/i18n-kernel";
import { WorkspaceJournal } from "./journal/workspace-journal";
import type { EditorKeymapProfile } from "./keymaps/types";
import {
	WindowLayoutStateManager,
	type WindowLayoutStateSnapshot,
} from "./layout/window-layout-state";
import { CommandPaletteController } from "./palette/command-palette";
import type {
	ScratchpadSession,
	ScratchpadSessionOptions,
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
export * from "./config/settings-semantic";
export * from "./config/settings-service";
export * from "./config/settings-ui-model";
export * from "./config/storage-driver";
export * from "./config/value-semantic-providers";
export * from "./contributions/command-registry";
export * from "./contributions/extension-contribution-manager";
export * from "./contributions/settings-registry";
export * from "./contributions/tab-registry";
export * from "./contributions/types";
export * from "./contributions/view-registry";
export * from "./editor/chips";
export * from "./editor/cursor-buffer";
export * from "./editor/editor-group-manager";
export * from "./editor/editor-kernel";
export * from "./editor/macro-document-manager";
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
	readonly keymap?:
		| EditorKeymapProfile
		| (() => EditorKeymapProfile | undefined);
	readonly settings?: WorkspaceSettingsService;
	readonly journal?: import("./journal/workspace-journal").WorkspaceJournalOptions;
	readonly scratchpad?: ScratchpadSessionOptions;
	readonly templates?: readonly MacroDocumentTemplate[];
}

export interface MacroWorkspace {
	readonly profile?: UserMacroProfile;
	readonly settings?: WorkspaceSettingsService;
	readonly layout: WindowLayoutStateManager;
	readonly editor: EditorKernel;
	readonly scratchpad: ScratchpadSession;
	readonly documents: MacroDocumentManager;
	readonly editorGroups: MacroEditorGroupManager;
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
	const i18n = createDefaultI18nKernel(options?.initialLocale ?? "en");
	const tabs = new TabRegistry({
		scratchpad: i18n.t("workspace.tab.scratchpad"),
		extensions: i18n.t("workspace.tab.extensions"),
	});
	const views = new ViewRegistry();
	const commands = new CommandRegistry();
	const settingsContributions = new SettingsContributionRegistry();
	const settingsNavigation = new SettingsNavigationState();
	const journal = new WorkspaceJournal(options?.journal);
	const runtime =
		options?.runtime ??
		new ExtensionRuntime({ profile: options?.profile, i18n });

	const layout = new WindowLayoutStateManager(
		tabs,
		views,
		options?.initialLayout,
	);
	const documents = new MacroDocumentManager(runtime, {
		initialText: options?.initialText,
		defaultTitle: i18n.t("editor.document.new"),
		scratchpad: options?.scratchpad,
		templates: options?.templates,
	});
	const activeDocument = documents.active();
	if (!activeDocument)
		throw new Error("Macro workspace requires an editor document");
	const editorGroups = new MacroEditorGroupManager(documents);
	const editor = activeDocument.editor;
	const scratchpad = activeDocument.session;
	const getKeymap =
		typeof options?.keymap === "function"
			? options.keymap
			: options?.keymap
				? () => options.keymap as EditorKeymapProfile
				: undefined;
	const palette = new CommandPaletteController(
		commands,
		layout,
		tabs,
		getKeymap,
	);
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
			for (const document of documents.list())
				void document.session.parseAllLines();
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
	saveCoordinator.register({
		id: "macro.documents",
		scope: "workspace",
		isDirty: () => documents.list().some((d) => d.dirty),
		save: async ({ scope }) => {
			if (scope === "active") {
				const active = documents.active() || documents.list()[0];
				if (active) {
					documents.markClean(active.documentId);
				}
			} else {
				for (const doc of documents.list()) {
					documents.markClean(doc.documentId);
				}
			}
			return { status: "saved" };
		},
	});
	commands.registerCommand(
		{
			command: "workspace.saveActive",
			title: "Save Active Tab",
			category: "Workspace",
		},
		{
			execute: async () => {
				const summary = await saveCoordinator.saveActive();
				return { saved: !summary.blocked };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.newScratchpad",
			title: "New Scratchpad Document",
			category: "Editor",
		},
		{
			execute: (options?: { title?: string; initialText?: string }) => {
				const doc = documents.createBlank(options?.title);
				if (options?.initialText) {
					documents.replaceText({
						documentId: doc.documentId,
						lines: options.initialText.split("\n"),
						expectedTextRevision: doc.textRevision,
					});
				}
				documents.select(doc.documentId);
				return { documentId: doc.documentId, title: doc.title };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.duplicateDocument",
			title: "Duplicate Document",
			category: "Editor",
		},
		{
			execute: (request?: { documentId?: string; newTitle?: string }) => {
				const targetId =
					request?.documentId ||
					documents.getActiveDocumentId() ||
					documents.list()[0]?.documentId;
				if (!targetId) return null;
				const doc = documents.duplicateDocument(targetId, request?.newTitle);
				documents.select(doc.documentId);
				return { documentId: doc.documentId, title: doc.title };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.splitGroup",
			title: "Split Editor Right",
			category: "Editor",
		},
		{
			execute: (request?: { orientation?: "horizontal" | "vertical" }) => {
				const group = editorGroups.create({
					orientation: request?.orientation ?? "horizontal",
				});
				return { groupId: group.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.createSplitGroup",
			title: "Split Editor Right",
			category: "Editor",
		},
		{
			execute: (request?: { orientation?: "horizontal" | "vertical" }) => {
				const group = editorGroups.create({
					orientation: request?.orientation ?? "horizontal",
				});
				return { groupId: group.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.closeDocument",
			title: "Close Document",
			category: "Editor",
		},
		{
			execute: (request?: { documentId?: string; force?: boolean }) => {
				const targetId =
					request?.documentId ||
					documents.getActiveDocumentId() ||
					documents.list()[0]?.documentId;
				if (targetId) {
					documents.close(targetId, request?.force ?? true);
				}
				return { documentId: targetId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.executeLine",
			title: "Execute Macro Line",
			category: "Editor",
		},
		{
			execute: (request?: {
				readonly documentId?: string;
				readonly lineNumber?: number;
				readonly expectedTextRevision?: number;
			}) => executeLineCommand(documents, request),
		},
	);
	commands.registerCommand(
		{
			command: "editor.executeRange",
			title: "Execute Macro Range",
			category: "Editor",
		},
		{
			execute: (request?: {
				readonly documentId?: string;
				readonly startLine?: number;
				readonly endLine?: number;
				readonly expectedTextRevision?: number;
			}) => executeRangeCommand(documents, request),
		},
	);
	commands.registerCommand(
		{
			command: "editor.executeValidLines",
			title: "Execute Valid Macro Lines",
			category: "Editor",
		},
		{
			execute: (request?: {
				readonly documentId?: string;
				readonly expectedTextRevision?: number;
			}) => executeValidLinesCommand(documents, request),
		},
	);
	commands.registerCommand(
		{
			command: "workspace.saveAll",
			title: "Save All Tabs",
			category: "Workspace",
		},
		{ execute: () => saveCoordinator.saveAll() },
	);
	commands.registerCommand(
		{
			command: "workspace.saveActiveAndClose",
			title: "Save and Close",
			category: "Workspace",
		},
		{ execute: () => saveCoordinator.saveActiveAndClose() },
	);
	commands.registerCommand(
		{
			command: "workspace.saveAllAndQuit",
			title: "Save All and Quit",
			category: "Workspace",
		},
		{ execute: () => saveCoordinator.saveAllAndQuit() },
	);
	commands.registerCommand(
		{
			command: "workspace.quit",
			title: "Quit Application",
			category: "Workspace",
		},
		{ execute: () => undefined },
	);
	commands.registerCommand(
		{
			command: "workspace.quitAll",
			title: "Quit All",
			category: "Workspace",
		},
		{ execute: () => saveCoordinator.saveAll("quit") },
	);
	commands.registerCommand(
		{
			command: "workspace.closeActiveTab",
			title: "Close Active Tab",
			category: "Workspace",
		},
		{ execute: () => layout.closeActiveTab() },
	);
	commands.registerCommand(
		{
			command: "workspace.openSettings",
			title: "Open Settings",
			category: "Workspace",
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
	commands.registerCommand(
		{
			command: "journal.reverseEntry",
			title: "Reverse Journal Entry",
			category: "Journal",
		},
		{
			execute: async (request?: { entryId: string; reason?: string }) => {
				if (request?.entryId) {
					return journal.reverseEntry(request.entryId, request.reason);
				}
				return null;
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
		get editor() {
			return documents.active()?.editor ?? editor;
		},
		get scratchpad() {
			return documents.active()?.session ?? scratchpad;
		},
		documents,
		editorGroups,
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
			editorGroups.dispose();
			documents.dispose();
			await runtime.dispose();
		},
	};

	return workspace;
}

function getDocument(documents: MacroDocumentManager, documentId?: string) {
	return documentId
		? (documents.get(documentId) ?? documents.select(documentId))
		: documents.active();
}

async function executeLineCommand(
	documents: MacroDocumentManager,
	request?: {
		readonly documentId?: string;
		readonly lineNumber?: number;
		readonly expectedTextRevision?: number;
	},
) {
	const document = getDocument(documents, request?.documentId);
	if (!document) return null;
	if (request?.expectedTextRevision !== undefined)
		documents.assertTextRevision(
			document.documentId,
			request.expectedTextRevision,
		);
	const lineNumber =
		request?.lineNumber ?? document.editor.getCursor().line + 1;
	const status = document.session.getLineStatusByNumber(lineNumber);
	if (status !== "valid") return null;
	return document.session.executeLine(lineNumber - 1);
}

async function executeRangeCommand(
	documents: MacroDocumentManager,
	request?: {
		readonly documentId?: string;
		readonly startLine?: number;
		readonly endLine?: number;
		readonly expectedTextRevision?: number;
	},
) {
	const document = getDocument(documents, request?.documentId);
	if (!document) return { receipts: [], skippedLines: [] };
	if (request?.expectedTextRevision !== undefined)
		documents.assertTextRevision(
			document.documentId,
			request.expectedTextRevision,
		);
	return document.session.executeRange(
		request?.startLine ?? 1,
		request?.endLine ?? document.session.getTotalLineCount(),
	);
}

async function executeValidLinesCommand(
	documents: MacroDocumentManager,
	request?: {
		readonly documentId?: string;
		readonly expectedTextRevision?: number;
	},
) {
	const document = getDocument(documents, request?.documentId);
	if (!document) return { receipts: [], skippedLines: [] };
	if (request?.expectedTextRevision !== undefined)
		documents.assertTextRevision(
			document.documentId,
			request.expectedTextRevision,
		);
	return document.session.executeValidLines();
}
