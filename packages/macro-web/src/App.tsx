import type {
	EditorOperation,
	SearchDirection,
} from "@stateful-mcp/macro-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityRail,
	type AppRoute,
	type PrimarySidebarTab,
} from "./components/ActivityRail";
import { CommandPalette } from "./components/CommandPalette";
import { FindOverlay } from "./components/FindOverlay";
import { Gallery } from "./components/Gallery";
import { HostRoute } from "./components/HostRoute";
import { MenuBar } from "./components/MenuBar";
import { OpenFolderModal } from "./components/OpenFolderModal";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";
import { SettingsTab } from "./components/SettingsTab";
import { RegisteredStatusBar } from "./components/StatusBar";
import { TemplateEditorModal } from "./components/TemplateEditorModal";
import { TemplatePickerModal } from "./components/TemplatePickerModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { WorkbenchShell } from "./components/WorkbenchShell";
import { CreateFileDialog } from "./components/workbench/CreateFileDialog";
import { formatChord, getBrowserShortcutPlatform } from "./lib/bindings";
import {
	BrowserKeymapController,
	type KeymapAnnouncement,
} from "./lib/browser-keymap-controller";
import { getEffectiveCommandShortcut } from "./lib/browser-workbench-defaults";
import {
	EditorSurfaceRegistry,
	EditorSurfaceRegistryContext,
} from "./lib/editor-surface-registry";
import { BrowserHostClient, type HostClient } from "./lib/host-client";
import {
	GalleryI18nScope,
	useI18n,
	type WebI18nKey,
} from "./lib/macro-i18n-provider";
import {
	loadUserPreferences,
	saveUserPreferences,
	subscribeUserPreferences,
} from "./lib/user-preferences-storage";
import {
	BrowserWorkspaceStore,
	useBrowserWorkspaceStore,
} from "./lib/workspace-store";

function routeFromPath(pathname: string): AppRoute {
	if (pathname === "/__dev/gallery") return "gallery";
	if (pathname === "/__dev/host") return "host";
	if (pathname === "/settings") return "settings";
	return "workbench";
}

export function App() {
	const { t, setLocale } = useI18n();
	const [route, setRoute] = useState<AppRoute>(() =>
		routeFromPath(window.location.pathname),
	);
	const host = useMemo<HostClient>(() => new BrowserHostClient(), []);
	const store = useMemo(() => new BrowserWorkspaceStore(host), [host]);
	const registry = useMemo(() => new EditorSurfaceRegistry(), []);
	const workspaceState = useBrowserWorkspaceStore(store);
	const snapshot = workspaceState.snapshot;
	const transport =
		workspaceState.status === "loading" ? "connecting" : workspaceState.status;
	const platform = useMemo(() => getBrowserShortcutPlatform(), []);
	const [userPrefs, setUserPrefs] = useState(() => loadUserPreferences());
	const [isDrawerOpen, setIsDrawerOpen] = useState(true);
	useEffect(() => subscribeUserPreferences(setUserPrefs), []);

	useEffect(() => {
		if (route === "gallery") return;
		void store.start().catch(() => undefined);
	}, [route, store]);

	useEffect(() => () => store.dispose(), [store]);

	useEffect(() => {
		const uiLocale = snapshot?.settings.sections
			.flatMap((section) => section.items)
			.find((item) => item.path.join(".") === "uiLocale")?.effectiveValue;
		if (typeof uiLocale === "string" && uiLocale.length > 0)
			setLocale(uiLocale);
	}, [setLocale, snapshot?.settings]);

	const [paletteOpen, setPaletteOpen] = useState(false);
	const [findSessions, setFindSessions] = useState<
		Readonly<
			Record<
				string,
				{
					readonly textRevision: number;
					readonly open: boolean;
					readonly direction: SearchDirection;
					readonly vimSearch?: boolean;
					readonly query: string;
					readonly replacement: string;
				}
			>
		>
	>({});
	const [paletteCommandMode, setPaletteCommandMode] = useState(false);
	const [paletteCommandToken, setPaletteCommandToken] = useState("");
	const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
	const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
	const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
	const [editingTemplate, setEditingTemplate] =
		useState<
			import("@stateful-mcp/macro-protocol").ScratchpadTemplateDescriptor
		>();
	const [announcement, setAnnouncement] = useState("");
	const [editorCursor, setEditorCursor] = useState("");
	const lastFocused = useRef<Element | null>(null);
	const [pendingNavigation, setPendingNavigation] = useState<{
		readonly route: AppRoute;
		readonly restore: HTMLElement | null;
	}>();

	const settingsDirty = Boolean(
		snapshot?.settings &&
			(snapshot.settings.modifiedCount > 0 ||
				snapshot.settings.totalModifiedCount > 0),
	);

	const [folderModalMode, setFolderModalMode] = useState<
		"open" | "init" | "saveAs" | undefined
	>();
	const [pendingCreateFile, setPendingCreateFile] = useState<{
		readonly groupId: string;
	} | null>(null);
	const [createFileTarget, setCreateFileTarget] = useState<{
		readonly groupId: string;
	} | null>(null);
	const [createFileError, setCreateFileError] = useState<string | undefined>();
	const [createFileSubmitting, setCreateFileSubmitting] = useState(false);
	const [activePrimaryTab, setActivePrimaryTab] =
		useState<PrimarySidebarTab>("explorer");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [paletteQuery, setPaletteQuery] = useState("");

	function openPalette(
		initialQuery = "",
		commandMode = false,
		commandToken = "",
	): void {
		lastFocused.current = document.activeElement;
		setPaletteInitialQuery(initialQuery);
		setPaletteQuery(initialQuery);
		setPaletteCommandMode(commandMode);
		setPaletteCommandToken(commandToken);
		setPaletteOpen(true);
	}

	function closePalette(): void {
		const wasCommandPalette = paletteCommandMode;
		setPaletteOpen(false);
		setPaletteInitialQuery("");
		setPaletteQuery("");
		setPaletteCommandMode(false);
		setPaletteCommandToken("");
		window.dispatchEvent(new CustomEvent("workbench:exitVimCommandMode"));
		if (!wasCommandPalette && lastFocused.current instanceof HTMLElement)
			lastFocused.current.focus();
	}

	function openFind(direction: SearchDirection, vimSearch = false): void {
		const documentId = snapshot?.editor.activeDocumentId;
		if (!documentId) return;
		setFindSessions((sessions) => ({
			...sessions,
			[documentId]: {
				...(sessions[documentId] ?? {
					query: "",
					replacement: "",
					textRevision: snapshot?.editor.activeDocument?.textRevision ?? 0,
				}),
				open: true,
				direction,
				vimSearch,
			},
		}));
	}

	function announce(message: KeymapAnnouncement): void {
		const text =
			message.key === "chord.prefix"
				? `${t("keymap.chordPrefix")} ${message.chord}`
				: message.key === "shortcut.unavailable"
					? `${t("keymap.shortcutUnavailable")} ${message.chord}`
					: message.key === "shortcut.conditional"
						? `${t("keymap.shortcutConditional")} ${message.chord}`
						: message.key === "shortcut.unmapped"
							? `${t("keymap.shortcutUnmapped")} ${message.chord} (${message.command})`
							: t(`keymap.${message.key}`);
		setAnnouncement(text);
	}

	function handleOpenFileInGroup(groupId: string): void {
		void store.applyEditorOperation({
			operation: "editor.focusGroup",
			requestId: crypto.randomUUID(),
			groupId,
		});
		setActivePrimaryTab("explorer");
		const isSidebarOpen = snapshot?.layout.regions.activity?.open ?? true;
		if (!isSidebarOpen) void runCommand("workbench.toggleSidepanel");
		if (!snapshot?.project || snapshot.project.ephemeral) {
			setFolderModalMode("open");
		}
	}

	function handleCreateFileInGroup(groupId: string): void {
		if (snapshot?.project && !snapshot.project.ephemeral) {
			setCreateFileError(undefined);
			setCreateFileTarget({ groupId });
			return;
		}
		setPendingCreateFile({ groupId });
		setFolderModalMode("open");
	}

	async function handleCreateFileSubmit(name: string): Promise<void> {
		const target = createFileTarget;
		if (!target) return;
		const createFile = host.createFile;
		if (!createFile) {
			setCreateFileError(t("common.error"));
			return;
		}
		setCreateFileSubmitting(true);
		setCreateFileError(undefined);
		try {
			const { path } = await createFile(".", name);
			await store.applyEditorOperation({
				operation: "editor.openFile",
				requestId: crypto.randomUUID(),
				path,
				groupId: target.groupId,
			});
			await store.refreshFileTree();
			setCreateFileTarget(null);
		} catch (error) {
			setCreateFileError(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setCreateFileSubmitting(false);
		}
	}

	async function runCommand(
		command: string,
		args?: readonly unknown[],
	): Promise<void> {
		if (command === "workbench.openSettings") {
			requestNavigate("settings");
			return;
		}
		if (command === "workbench.openProject") {
			setFolderModalMode("open");
			return;
		}
		if (command === "workbench.initProject") {
			setFolderModalMode("init");
			return;
		}
		if (command === "workbench.saveAsProject") {
			setFolderModalMode("saveAs");
			return;
		}
		if (
			command === "workbench.action.newScratchpadFromTemplate" ||
			command === "editor.newScratchpadFromTemplate"
		) {
			if (args && typeof args[0] === "string") {
				await store.applyEditorOperation({
					operation: "editor.newScratchpadFromTemplate",
					requestId: crypto.randomUUID(),
					templateId: args[0],
				});
			} else {
				setIsTemplatePickerOpen(true);
			}
			return;
		}
		if (
			command === "workbench.action.saveScratchpadAsTemplate" ||
			command === "editor.saveScratchpadAsTemplate"
		) {
			const activeDoc = snapshot?.editor.activeDocument;
			const activeSummary = snapshot?.editor.documents.find(
				(document) => document.documentId === snapshot.editor.activeDocumentId,
			);
			const draftLines = activeDoc
				? workspaceState.editorDrafts[activeDoc.documentId]
				: undefined;
			const initialText = draftLines
				? draftLines.join("\n")
				: (activeDoc?.lines.map((l) => l.rawText).join("\n") ?? "");
			setEditingTemplate({
				templateId: "",
				providerId: "macro.text",
				title: activeSummary?.title ?? "",
				initialText,
				pinnedMacroIds: activeSummary?.pinnedMacroIds ?? [],
				source:
					snapshot?.project && !snapshot.project.ephemeral ? "project" : "user",
			});
			setIsTemplateEditorOpen(true);
			return;
		}
		if (command === "editor.save") {
			const active = snapshot?.editor.documents.find(
				(document) => document.documentId === snapshot.editor.activeDocumentId,
			);
			if (active) {
				if (active.filePath) {
					await store.applyEditorOperation({
						operation: "editor.save",
						requestId: crypto.randomUUID(),
						documentId: active.documentId,
						expectedTextRevision: active.textRevision,
					});
				} else {
					await store.applyEditorOperation({
						operation: "editor.saveScratchpad",
						requestId: crypto.randomUUID(),
						documentId: active.documentId,
						expectedTextRevision: active.textRevision,
					});
				}
			}
			return;
		}
		if (command === "editor.saveAll") {
			const documents = snapshot?.editor.documents ?? [];
			for (const doc of documents) {
				if (doc.dirty) {
					if (doc.filePath) {
						await store.applyEditorOperation({
							operation: "editor.save",
							requestId: crypto.randomUUID(),
							documentId: doc.documentId,
						});
					} else {
						await store.applyEditorOperation({
							operation: "editor.saveScratchpad",
							requestId: crypto.randomUUID(),
							documentId: doc.documentId,
						});
					}
				}
			}
			return;
		}
		if (command === "editor.saveAndClose") {
			const active = snapshot?.editor.documents.find(
				(document) => document.documentId === snapshot.editor.activeDocumentId,
			);
			if (active) {
				const result = await store.applyEditorOperation(
					active.filePath
						? {
								operation: "editor.save",
								requestId: crypto.randomUUID(),
								documentId: active.documentId,
							}
						: {
								operation: "editor.saveScratchpad",
								requestId: crypto.randomUUID(),
								documentId: active.documentId,
							},
				);
				if (result.status === "accepted") {
					await store.applyEditorOperation({
						operation: "editor.closeDocument",
						requestId: crypto.randomUUID(),
						documentId: active.documentId,
						force: true,
					});
				}
			}
			return;
		}
		if (command === "editor.executeLine") {
			const docId = snapshot?.editor.activeDocument?.documentId;
			await store.executeCommand("editor.executeLine", [
				{
					documentId: docId,
				},
			]);
			return;
		}
		if (command === "editor.executeValidLines") {
			const docId = snapshot?.editor.activeDocument?.documentId;
			await store.executeCommand("editor.executeValidLines", [
				{ documentId: docId },
			]);
			return;
		}
		await store.executeCommand(command, args);
	}

	const uiCommandHandlers = useMemo(
		() =>
			new Map<string, () => void>([
				["workbench.commandPalette", () => openPalette()],
				["workbench.openProject", () => setFolderModalMode("open")],
				["workbench.saveAsProject", () => setFolderModalMode("saveAs")],
				["editor.find", () => openFind("forward")],
				["editor.replace", () => openFind("forward")],
			]),
		[openPalette, openFind],
	);

	useEffect(() => {
		const controller = new BrowserKeymapController({
			getSnapshot: () => snapshot,
			getContext: () => {
				const active = registry.getActive();
				if (active) {
					return {
						editorFocused: true,
						vimEnabled: active.vimEnabled,
						context: active.context,
					};
				}
				return {
					editorFocused: false,
					context: {
						activeTabId: snapshot?.activeTabId,
						focusedPane: snapshot?.layout.focusedPane,
					},
				};
			},
			onEditorKeyDown: (event) => {
				const active = registry.getActive();
				return active?.handleKeyDown?.(event) ?? false;
			},
			onCommand: (command) => {
				const uiHandler = uiCommandHandlers.get(command);
				if (uiHandler) {
					uiHandler();
					return;
				}
				return runCommand(command);
			},
			onCommandError: () => setAnnouncement(t("palette.executionFailed")),
			announce,
			platform,
		});
		controller.attach(window);
		return () => controller.dispose();
	}, [snapshot, store, registry, t, uiCommandHandlers, platform]);

	const routePath = (next: AppRoute) =>
		next === "gallery"
			? "/__dev/gallery"
			: next === "host"
				? "/__dev/host"
				: next === "settings"
					? "/settings"
					: "/";

	const commitNavigate = (next: AppRoute, replace = false) => {
		setRoute(next);
		const method = replace ? "replaceState" : "pushState";
		window.history[method]({}, "", routePath(next));
	};

	const navigate = (next: AppRoute) => {
		if (next === route || !settingsDirty) {
			commitNavigate(next);
			return;
		}
		setPendingNavigation({
			route: next,
			restore:
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null,
		});
	};

	const requestNavigate = navigate;

	useEffect(() => {
		const handlePopState = () => {
			const next = routeFromPath(window.location.pathname);
			if (!settingsDirty) {
				setRoute(next);
				return;
			}
			window.history.pushState({}, "", routePath(route));
			setPendingNavigation({
				route: next,
				restore:
					document.activeElement instanceof HTMLElement
						? document.activeElement
						: null,
			});
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [route, settingsDirty]);

	const finishNavigation = (restore: HTMLElement | null) => {
		setPendingNavigation(undefined);
		queueMicrotask(() => restore?.focus());
	};

	const discardAndNavigate = async () => {
		if (!pendingNavigation || !snapshot?.settings) return;
		const target = pendingNavigation.route;
		try {
			const result = await store.applySettings({
				operation: "discard",
				expectedRevision: snapshot.settings.settingsRevision,
			});
			if (result.status !== "saved") {
				setAnnouncement(t("settings.conflict"));
				return;
			}
			const restore = pendingNavigation.restore;
			commitNavigate(target);
			finishNavigation(restore);
		} catch {
			setAnnouncement(t("settings.conflict"));
		}
	};

	const saveAndNavigate = async () => {
		if (!pendingNavigation || !snapshot?.settings) return;
		const target = pendingNavigation.route;
		try {
			const result = await store.applySettings({
				operation: "save",
				expectedRevision: snapshot.settings.settingsRevision,
			});
			if (result.status !== "saved") {
				setAnnouncement(t("settings.conflict"));
				return;
			}
			const restore = pendingNavigation.restore;
			commitNavigate(target);
			finishNavigation(restore);
		} catch {
			setAnnouncement(t("settings.conflict"));
		}
	};

	useEffect(() => {
		void store.refreshFileTree();

		if (activePrimaryTab === "explorer") {
			const interval = setInterval(() => {
				void store.refreshFileTree();
			}, 4000);

			const onFocus = () => {
				void store.refreshFileTree();
			};
			window.addEventListener("focus", onFocus);

			return () => {
				clearInterval(interval);
				window.removeEventListener("focus", onFocus);
			};
		}
	}, [store, activePrimaryTab]);

	const diagnostics = snapshot?.diagnostics.length ?? 0;
	const activeDoc = snapshot?.editor.documents.find(
		(d) => d.documentId === snapshot?.editor.activeDocumentId,
	);
	const activeDocumentId = snapshot?.editor.activeDocumentId;
	const findSession = activeDocumentId
		? findSessions[activeDocumentId]
		: undefined;
	const findAdapter = () => {
		const documentSurface = registry
			.list()
			.find((surface) => surface.context.activeDocumentId === activeDocumentId);
		const adapter = documentSurface?.adapter ?? registry.getActive()?.adapter;
		return adapter;
	};
	const findWidget =
		activeDocumentId && findSession?.open ? (
			<FindOverlay
				key={activeDocumentId}
				direction={findSession.direction}
				initialQuery={findSession.query}
				initialReplacement={findSession.replacement}
				vimMode={findSession.vimSearch}
				onFind={(query, direction, navigate, options) => {
					const result = findAdapter()?.searchText?.(
						query,
						direction,
						navigate,
						options,
					);
					return result ?? false;
				}}
				onReplace={(query, replacement, options) => {
					const result =
						findAdapter()?.replaceCurrentMatch?.(
							query,
							replacement,
							undefined,
							undefined,
							options,
						) ?? false;
					return Boolean(result);
				}}
				onReplaceAll={(query, replacement, options) =>
					findAdapter()?.replaceAllMatches?.(query, replacement, options) ?? 0
				}
				onQueryChange={(query) =>
					setFindSessions((sessions) => ({
						...sessions,
						[activeDocumentId]: { ...findSession, query },
					}))
				}
				onReplacementChange={(replacement) =>
					setFindSessions((sessions) => ({
						...sessions,
						[activeDocumentId]: { ...findSession, replacement },
					}))
				}
				onClose={() =>
					setFindSessions((sessions) => ({
						...sessions,
						[activeDocumentId]: { ...findSession, open: false },
					}))
				}
				onAccept={
					findSession.vimSearch
						? () => {
								setFindSessions((sessions) => ({
									...sessions,
									[activeDocumentId]: { ...findSession, open: false },
								}));
								requestAnimationFrame(() =>
									registry
										.list()
										.find(
											(surface) =>
												surface.context.activeDocumentId === activeDocumentId,
										)
										?.element.focus(),
								);
							}
						: undefined
				}
			/>
		) : undefined;
	return (
		<EditorSurfaceRegistryContext.Provider value={registry}>
			<div className="app-shell">
				<div className="sr-only" aria-live="polite">
					{announcement}
				</div>

				<MenuBar
					snapshot={snapshot}
					activeDocumentTitle={activeDoc?.title}
					isSidebarOpen={snapshot?.layout.regions.activity?.open ?? true}
					isInspectorOpen={snapshot?.layout.sidepanelOpen ?? true}
					isDrawerOpen={isDrawerOpen}
					inspectorPosition={userPrefs.inspectorPosition ?? "right"}
					onSetInspectorPosition={(position) =>
						saveUserPreferences({ inspectorPosition: position })
					}
					onToggleSidebar={() => void runCommand("workbench.toggleSidepanel")}
					onToggleInspector={() => void runCommand("workbench.toggleInspector")}
					onToggleDrawer={() => setIsDrawerOpen((open) => !open)}
					onOpenPalette={openPalette}
					onOpenFolderModal={setFolderModalMode}
					onOpenTemplatePicker={() => setIsTemplatePickerOpen(true)}
					onCommand={(cmd, args) => {
						if (cmd === "workbench.openProjectSettings") {
							setIsProjectSettingsOpen(true);
							return;
						}
						void runCommand(cmd, args);
					}}
					onCloseProject={() => void store.closeProject()}
					onNavigate={navigate}
					currentRoute={route}
				/>

				<div
					className={`app-body ${userPrefs.inspectorPosition === "left" ? "inspector-docked-left" : ""}`}
				>
					<ActivityRail
						currentRoute={route}
						activePrimaryTab={activePrimaryTab}
						isSidebarOpen={snapshot?.layout.regions.activity?.open ?? true}
						onSelectPrimaryTab={setActivePrimaryTab}
						onToggleSidebar={() => void runCommand("workbench.toggleSidepanel")}
						onNavigate={navigate}
					/>

					<main className="app-content">
						{route === "gallery" ? (
							<GalleryI18nScope>
								<Gallery />
							</GalleryI18nScope>
						) : route === "settings" ? (
							<SettingsTab client={host} snapshot={snapshot} />
						) : route === "host" ? (
							<HostRoute snapshot={snapshot} transport={transport} />
						) : (
							<WorkbenchShell
								snapshot={snapshot}
								isDrawerOpen={isDrawerOpen}
								onToggleDrawer={() => setIsDrawerOpen((open) => !open)}
								status={workspaceState.status}
								editorDrafts={workspaceState.editorDrafts}
								editorConflict={workspaceState.editorConflict}
								editorResult={workspaceState.editorResult}
								pendingEditorRequests={workspaceState.pendingEditorRequests}
								editorError={workspaceState.editorError}
								errorMessage={
									workspaceState.protocolError?.message ?? t("common.error")
								}
								activePrimaryTab={activePrimaryTab}
								onOpenFolderModal={setFolderModalMode}
								onCommand={(command, args) => {
									if (command === "workbench.toggleDrawer") {
										setIsDrawerOpen((open) => !open);
										return;
									}
									void runCommand(command, args);
								}}
								onEditorOperation={(operation: EditorOperation) => {
									void store
										.applyEditorOperation(operation)
										.catch(() => undefined);
								}}
								onSetEditorDraft={(documentId, lines) =>
									store.setEditorDraft(documentId, lines)
								}
								onReloadEditorConflict={() => store.reloadEditorConflict()}
								onOverwriteEditorConflict={() =>
									void store.overwriteEditorConflict()
								}
								onEditorCursorChange={setEditorCursor}
								onOpenPalette={openPalette}
								onOpenSearch={openFind}
								searchWidget={findWidget}
								projectFileTree={workspaceState.projectFileTree}
								onRefreshFileTree={() => void store.refreshFileTree()}
								onOpenFile={(path) => {
									void store.applyEditorOperation({
										operation: "editor.openFile",
										requestId: crypto.randomUUID(),
										path,
									});
								}}
								onCreateFile={(parent: string, name: string) => {
									void host.createFile?.(parent, name).then(({ path }) => {
										void store.applyEditorOperation({
											operation: "editor.openFile",
											requestId: crypto.randomUUID(),
											path,
										});
										return store.refreshFileTree();
									});
								}}
								onCreateFolder={(parent: string, name: string) => {
									void host
										.createProjectDirectory?.(parent, name)
										.then(() => store.refreshFileTree());
								}}
								onOpenFileInGroup={handleOpenFileInGroup}
								onCreateFileInGroup={handleCreateFileInGroup}
								onEditTemplate={(template) => {
									setEditingTemplate(template);
									setIsTemplateEditorOpen(true);
								}}
							/>
						)}
					</main>
				</div>

				<RegisteredStatusBar
					profile={snapshot?.profile.displayName}
					domain={snapshot?.applications[0]?.displayName}
					project={
						snapshot?.project?.displayNameI18nKey
							? t(snapshot.project.displayNameI18nKey as WebI18nKey)
							: snapshot?.project?.displayName
					}
					diagnostics={diagnostics}
					cursor={editorCursor}
					commandMode={paletteOpen && paletteCommandMode}
					commandText={paletteQuery}
					commandToken={paletteCommandToken}
					commands={snapshot?.commands}
					onToggleVim={() =>
						window.dispatchEvent(new CustomEvent("workbench:toggleVim"))
					}
					onAction={(command) => {
						if (command === "workbench.openProjectSettings") {
							setIsProjectSettingsOpen(true);
							return;
						}
						if (command === "workbench.toggleVim") {
							window.dispatchEvent(new CustomEvent("workbench:toggleVim"));
							return;
						}
						if (command === "workspace.selectProfile") navigate("settings");
						if (command === "host.openDiagnostics") navigate("host");
					}}
				/>

				{pendingNavigation && (
					<UnsavedChangesModal
						onKeepEditing={() => {
							const restore = pendingNavigation.restore;
							setPendingNavigation(undefined);
							queueMicrotask(() => restore?.focus());
						}}
						onDiscard={() => void discardAndNavigate()}
						onSave={() => void saveAndNavigate()}
					/>
				)}

				{paletteOpen && (
					<CommandPalette
						commands={(snapshot?.commands ?? []).map((command) => {
							const effectiveKeybinding =
								getEffectiveCommandShortcut(snapshot, command.id) ??
								command.keybinding;
							return {
								...command,
								keybinding: effectiveKeybinding
									? formatChord(effectiveKeybinding, platform)
									: undefined,
							};
						})}
						initialQuery={paletteInitialQuery}
						commandToken={paletteCommandToken}
						onQueryChange={setPaletteQuery}
						onExecute={(command, args) => {
							return runCommand(command, args).then(closePalette);
						}}
						onClose={closePalette}
					/>
				)}

				{folderModalMode && (
					<OpenFolderModal
						mode={folderModalMode}
						client={host}
						onSelect={async (path, displayName) => {
							try {
								if (folderModalMode === "open") {
									await store.openProject(path);
									const pending = pendingCreateFile;
									if (pending) {
										setPendingCreateFile(null);
										setCreateFileError(undefined);
										setCreateFileTarget(pending);
									}
								} else if (folderModalMode === "init")
									await store.initProject(path, displayName);
								else if (folderModalMode === "saveAs")
									await store.saveAsProject(path);
							} finally {
								await store.refreshFileTree();
							}
						}}
						onClose={() => {
							setFolderModalMode(undefined);
							setPendingCreateFile(null);
						}}
					/>
				)}

				<CreateFileDialog
					open={createFileTarget !== null}
					parentLabel={snapshot?.project?.displayName}
					onSubmit={(name) => handleCreateFileSubmit(name)}
					onCancel={() => {
						setCreateFileTarget(null);
						setCreateFileError(undefined);
					}}
					error={createFileError}
					submitting={createFileSubmitting}
				/>

				<TemplatePickerModal
					isOpen={isTemplatePickerOpen}
					onClose={() => setIsTemplatePickerOpen(false)}
					templates={snapshot?.editor.templates ?? []}
					onSelectTemplate={(templateId) => {
						void store.applyEditorOperation({
							operation: "editor.newScratchpadFromTemplate",
							requestId: crypto.randomUUID(),
							templateId,
						});
					}}
					onNewTemplate={() => {
						setEditingTemplate(undefined);
						setIsTemplateEditorOpen(true);
					}}
					onEditTemplate={(template) => {
						setEditingTemplate(template);
						setIsTemplateEditorOpen(true);
					}}
					onOpenTemplateInEditor={(templateId) => {
						setIsTemplatePickerOpen(false);
						void store.applyEditorOperation({
							operation: "editor.openTemplateAsDocument",
							requestId: crypto.randomUUID(),
							templateId,
						});
					}}
					onDeleteTemplate={(template) => {
						void store.applyEditorOperation({
							operation: "editor.deleteTemplate",
							requestId: crypto.randomUUID(),
							templateId: template.templateId,
							scope: template.source === "user" ? "user" : "project",
						});
					}}
				/>
				<TemplateEditorModal
					isOpen={isTemplateEditorOpen}
					template={editingTemplate}
					isProjectOpen={Boolean(
						snapshot?.project && !snapshot.project.ephemeral,
					)}
					onClose={() => setIsTemplateEditorOpen(false)}
					onSave={(template, scope) => {
						const isCreateOrFork =
							!editingTemplate || editingTemplate.source === "extension";
						void store
							.applyEditorOperation({
								operation: "editor.saveTemplate",
								requestId: crypto.randomUUID(),
								template,
								scope,
							})
							.then(() => {
								if (isCreateOrFork) {
									// Open the newly created template as an editable canvas document.
									void store.applyEditorOperation({
										operation: "editor.openTemplateAsDocument",
										requestId: crypto.randomUUID(),
										templateId: template.templateId,
									});
								}
							});
						setIsTemplateEditorOpen(false);
					}}
				/>
				<ProjectSettingsModal
					isOpen={isProjectSettingsOpen}
					client={host}
					onClose={() => setIsProjectSettingsOpen(false)}
					onManageTemplates={() => {
						setIsProjectSettingsOpen(false);
						setIsTemplatePickerOpen(true);
					}}
					onUpdated={(result) => {
						if (result.status === "accepted")
							store.installSnapshot(result.snapshot);
					}}
				/>
			</div>
		</EditorSurfaceRegistryContext.Provider>
	);
}
