import type { UserMacroProfile } from "../contracts/extension-config";
import { ExtensionRuntime } from "../extensions/runtime";
import { WorkspaceSaveCoordinator } from "./commands/save-coordinator";
import { createDefaultSettingsSchema } from "./config/schema";
import type { OpenSettingsRequest } from "./config/settings-navigation";
import { SettingsNavigationState } from "./config/settings-navigation";
import { WorkspaceSettingsService } from "./config/settings-service";
import { SettingsUiModel } from "./config/settings-ui-model";
import { CommandRegistry } from "./contributions/command-registry";
import { ExtensionContributionManager } from "./contributions/extension-contribution-manager";
import { ResourceRegistry } from "./contributions/resource-registry";
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
export * from "./config/schema";
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
export * from "./contributions/resource-registry";
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
export * from "./i18n/locales/i18n-keys";
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
	readonly resources: ResourceRegistry;
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
	const resources = new ResourceRegistry();
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
			schema: createDefaultSettingsSchema(i18n),
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
			command: "editor.save",
			titleI18nKey: "menu.save",
			categoryI18nKey: "common.editor",
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
			titleI18nKey: "editor.document.new",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (options?: {
				readonly groupId?: string;
				readonly title?: string;
				readonly initialText?: string;
			}) => {
				const doc = documents.createBlank(options?.title);
				if (options?.initialText) {
					documents.replaceText({
						documentId: doc.documentId,
						lines: options.initialText.split("\n"),
						expectedTextRevision: doc.textRevision,
					});
				}
				if (options?.groupId)
					editorGroups.moveDocument(doc.documentId, options.groupId);
				else documents.select(doc.documentId);
				return { documentId: doc.documentId, title: doc.title };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.newScratchpadFromTemplate",
			titleI18nKey: "templates.picker.newFromTemplate",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (options?: {
				readonly templateId?: string;
				readonly groupId?: string;
			}) => {
				if (!options?.templateId) {
					return { status: "pending_picker" };
				}
				const doc = documents.createFromTemplate(options.templateId);
				if (options?.groupId)
					editorGroups.moveDocument(doc.documentId, options.groupId);
				else documents.select(doc.documentId);
				return { documentId: doc.documentId, title: doc.title };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.duplicateDocument",
			titleI18nKey: "editor.document.duplicate",
			categoryI18nKey: "common.editor",
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
			command: "editor.createSplitGroup",
			titleI18nKey: "editor.splitRight",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (request?: {
				readonly sourceGroupId?: string;
				readonly documentId?: string;
				readonly moveDocument?: boolean;
				readonly behavior?: "duplicate" | "empty";
				readonly orientation?: "horizontal" | "vertical";
			}) => {
				const group = editorGroups.create({
					sourceGroupId: request?.sourceGroupId,
					documentId: request?.documentId,
					moveDocument: request?.moveDocument,
					behavior: request?.behavior,
					orientation: request?.orientation ?? "vertical",
				});
				return { groupId: group.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.splitRight",
			titleI18nKey: "editor.splitRight",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (request?: {
				readonly sourceGroupId?: string;
				readonly documentId?: string;
				readonly moveDocument?: boolean;
				readonly behavior?: "duplicate" | "empty";
			}) => {
				const group = editorGroups.create({
					sourceGroupId: request?.sourceGroupId,
					documentId: request?.documentId,
					moveDocument: request?.moveDocument,
					behavior: request?.behavior,
					orientation: "vertical",
				});
				return { groupId: group.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.splitDown",
			titleI18nKey: "editor.splitDown",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (request?: {
				readonly sourceGroupId?: string;
				readonly documentId?: string;
				readonly moveDocument?: boolean;
				readonly behavior?: "duplicate" | "empty";
			}) => {
				const group = editorGroups.create({
					sourceGroupId: request?.sourceGroupId,
					documentId: request?.documentId,
					moveDocument: request?.moveDocument,
					behavior: request?.behavior,
					orientation: "horizontal",
				});
				return { groupId: group.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.closeGroup",
			titleI18nKey: "editor.group.close",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (request?: { readonly groupId?: string }) => {
				const targetId = request?.groupId ?? editorGroups.getActiveGroupId();
				const closed = editorGroups.close(targetId);
				return { groupId: closed.groupId };
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.resizeSplit",
			titleI18nKey: "editor.group.split",
			categoryI18nKey: "common.editor",
		},
		{
			execute: (request: {
				readonly nodeId: string;
				readonly ratios: readonly number[];
			}) => {
				editorGroups.resizeSplit(request.nodeId, request.ratios);
				return null;
			},
		},
	);
	commands.registerCommand(
		{
			command: "editor.closeDocument",
			titleI18nKey: "editor.document.close",
			categoryI18nKey: "common.editor",
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
			titleI18nKey: "editor.execution.line",
			categoryI18nKey: "common.editor",
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
			titleI18nKey: "editor.execution.range",
			categoryI18nKey: "common.editor",
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
			titleI18nKey: "editor.execution.validLines",
			categoryI18nKey: "common.editor",
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
			command: "editor.saveAll",
			titleI18nKey: "workspace.saveAll",
			categoryI18nKey: "common.editor",
		},
		{ execute: () => saveCoordinator.saveAll() },
	);
	commands.registerCommand(
		{
			command: "editor.saveAndClose",
			titleI18nKey: "workspace.saveActiveAndClose",
			categoryI18nKey: "common.editor",
		},
		{ execute: () => saveCoordinator.saveActiveAndClose() },
	);
	commands.registerCommand(
		{
			command: "editor.closeDocument",
			titleI18nKey: "editor.document.close",
			categoryI18nKey: "common.editor",
		},
		{ execute: () => undefined },
	);
	commands.registerCommand(
		{
			command: "editor.closeAll",
			titleI18nKey: "workspace.quitAll",
			categoryI18nKey: "common.editor",
		},
		{ execute: () => saveCoordinator.saveAll("quit") },
	);
	commands.registerCommand(
		{
			command: "workspace.closeActiveTab",
			titleI18nKey: "workspace.closeActiveTab",
			categoryI18nKey: "common.workspace",
		},
		{ execute: () => layout.closeActiveTab() },
	);
	commands.registerCommand(
		{
			command: "workbench.openSettings",
			titleI18nKey: "workbench.openSettings",
			categoryI18nKey: "common.workspace",
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
			titleI18nKey: "workspace.closeSettings",
			categoryI18nKey: "common.workspace",
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
			titleI18nKey: "workspace.toggleSettings",
			categoryI18nKey: "common.workspace",
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
			titleI18nKey: "workspace.openExtensions",
			categoryI18nKey: "common.workspace",
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
			command: "workbench.toggleSidepanel",
			titleI18nKey: "menu.toggleSidepanel",
			categoryI18nKey: "menu.view",
			verb: "sidepanel",
		},
		{ execute: () => layout.toggleRegion("activity") },
	);
	commands.registerCommand(
		{
			command: "workbench.toggleInspector",
			titleI18nKey: "menu.toggleInspector",
			categoryI18nKey: "menu.view",
			verb: "inspector",
		},
		{ execute: () => layout.toggleSidepanel() },
	);
	commands.registerCommand(
		{
			command: "workbench.toggleActivity",
			titleI18nKey: "menu.toggleSidepanel",
			categoryI18nKey: "menu.view",
		},
		{ execute: () => layout.toggleRegion("activity") },
	);
	commands.registerCommand(
		{
			command: "layout.setRegionWidthRatio",
			titleI18nKey: "layout.setRegionWidthRatio",
			categoryI18nKey: "menu.view",
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
			titleI18nKey: "layout.setDomainRailWidthRatio",
			categoryI18nKey: "menu.view",
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
			titleI18nKey: "journal.reverseEntry",
			categoryI18nKey: "journal.title",
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
	commands.registerCommand(
		{
			command: "workbench.view.journal",
			titleI18nKey: "menu.view.journal",
			categoryI18nKey: "menu.view",
		},
		{
			execute: () => {
				layout.toggleRegion("activity");
				return { viewId: "journal" };
			},
		},
	);
	commands.registerCommand(
		{
			command: "journal.reverseLast",
			titleI18nKey: "journal.reverseLast",
			categoryI18nKey: "journal.title",
		},
		{
			execute: async (request?: { reason?: string }) => {
				const entries = journal.getEntries();
				const committed = [...entries]
					.reverse()
					.find((e) => e.status === "committed");
				if (committed) {
					return journal.reverseEntry(
						committed.id,
						request?.reason ?? "Reversed by user via command palette",
					);
				}
				return null;
			},
		},
	);
	commands.registerCommand(
		{
			command: "journal.refresh",
			titleI18nKey: "journal.action.refresh",
			categoryI18nKey: "journal.title",
		},
		{
			execute: () => {
				return { count: journal.getEntries().length };
			},
		},
	);
	const contributions = new ExtensionContributionManager(
		views,
		tabs,
		commands,
		settingsContributions,
		resources,
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
		resources,
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
