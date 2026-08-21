import type { EditorOperation } from "@stateful-mcp/macro-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityRail } from "./components/ActivityRail";
import { CommandPalette } from "./components/CommandPalette";
import { FindOverlay } from "./components/FindOverlay";
import { Gallery } from "./components/Gallery";
import { HostRoute } from "./components/HostRoute";
import { MenuBar } from "./components/MenuBar";
import { OpenFolderModal } from "./components/OpenFolderModal";
import { SettingsTab } from "./components/SettingsTab";
import { RegisteredStatusBar } from "./components/StatusBar";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { WorkbenchShell } from "./components/WorkbenchShell";
import { formatChord, getBrowserShortcutPlatform } from "./lib/bindings";
import {
	BrowserKeymapController,
	type KeymapAnnouncement,
} from "./lib/browser-keymap-controller";
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
	BrowserWorkspaceStore,
	useBrowserWorkspaceStore,
} from "./lib/workspace-store";

type Route = "workbench" | "settings" | "gallery" | "host";

function routeFromPath(pathname: string): Route {
	if (pathname === "/__dev/gallery") return "gallery";
	if (pathname === "/__dev/host") return "host";
	if (pathname === "/settings") return "settings";
	return "workbench";
}

export function App() {
	const { t, setLocale } = useI18n();
	const [route, setRoute] = useState<Route>(() =>
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
					readonly direction: "forward" | "backward";
					readonly query: string;
					readonly replacement: string;
				}
			>
		>
	>({});
	const [paletteCommandMode, setPaletteCommandMode] = useState(false);
	const [paletteCommandToken, setPaletteCommandToken] = useState("");
	const [announcement, setAnnouncement] = useState("");
	const [editorCursor, setEditorCursor] = useState("");
	const lastFocused = useRef<Element | null>(null);
	const [pendingNavigation, setPendingNavigation] = useState<{
		readonly route: Route;
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
		setPaletteOpen(false);
		setPaletteInitialQuery("");
		setPaletteQuery("");
		setPaletteCommandMode(false);
		setPaletteCommandToken("");
		if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
	}

	function openFind(direction: "forward" | "backward"): void {
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

	async function runCommand(
		command: string,
		args?: readonly unknown[],
	): Promise<void> {
		if (
			command === "workspace.openSettings" ||
			command === "workspace.toggleSettings"
		) {
			requestNavigate("settings");
			return;
		}
		if (command === "workbench.openProject" || command === "file.openProject") {
			setFolderModalMode("open");
			return;
		}
		if (command === "workbench.initProject" || command === "file.initProject") {
			setFolderModalMode("init");
			return;
		}
		if (
			command === "workbench.saveAsProject" ||
			command === "workspace.saveAs" ||
			command === "file.saveAsProject"
		) {
			setFolderModalMode("saveAs");
			return;
		}
		if (command === "editor.save" || command === "workspace.saveActive") {
			await store.executeCommand("workspace.saveActive", args);
			return;
		}
		if (command === "workspace.saveAll") {
			await store.executeCommand("workspace.saveAll", args);
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
			onEditorKeyDown: (event) =>
				registry.getActive()?.handleKeyDown?.(event) ?? false,
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

	const routePath = (next: Route) =>
		next === "gallery"
			? "/__dev/gallery"
			: next === "host"
				? "/__dev/host"
				: next === "settings"
					? "/settings"
					: "/";

	const commitNavigate = (next: Route, replace = false) => {
		setRoute(next);
		const method = replace ? "replaceState" : "pushState";
		window.history[method]({}, "", routePath(next));
	};

	const navigate = (next: Route) => {
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
		return documentSurface?.adapter ?? registry.getActive()?.adapter;
	};
	const findWidget =
		activeDocumentId && findSession?.open ? (
			<FindOverlay
				key={activeDocumentId}
				direction={findSession.direction}
				initialQuery={findSession.query}
				initialReplacement={findSession.replacement}
				onFind={(query, direction) =>
					findAdapter()?.searchText?.(query, direction) ?? false
				}
				onReplace={(query, replacement) =>
					Boolean(findAdapter()?.replaceCurrentMatch?.(query, replacement))
				}
				onReplaceAll={(query, replacement) =>
					findAdapter()?.replaceAllMatches?.(query, replacement) ?? 0
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
					onCommand={(cmd, args) => {
						void runCommand(cmd, args);
					}}
					onOpenPalette={openPalette}
					onOpenFolderModal={setFolderModalMode}
					onCloseProject={() => void store.closeProject()}
					onNavigate={navigate}
					currentRoute={route}
				/>

				<div className="app-body">
					<ActivityRail currentRoute={route} onNavigate={navigate} />

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
								status={workspaceState.status}
								editorDrafts={workspaceState.editorDrafts}
								editorConflict={workspaceState.editorConflict}
								editorResult={workspaceState.editorResult}
								pendingEditorRequests={workspaceState.pendingEditorRequests}
								editorError={workspaceState.editorError}
								errorMessage={
									workspaceState.protocolError?.message ?? t("common.error")
								}
								onCommand={(command, args) => {
									void store
										.executeCommand(command, args)
										.then(() => {
											if (command === "workspace.openSettings")
												navigate("settings");
										})
										.catch(() => undefined);
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
					onAction={(command) => {
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
						commands={(snapshot?.commands ?? []).map((command) => ({
							...command,
							keybinding: command.keybinding
								? formatChord(command.keybinding, platform)
								: undefined,
						}))}
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
						onSelect={async (path) => {
							if (folderModalMode === "open") await store.openProject(path);
							else if (folderModalMode === "init")
								await store.initProject(path);
							else if (folderModalMode === "saveAs")
								await store.saveAsProject(path);
						}}
						onClose={() => setFolderModalMode(undefined)}
					/>
				)}
			</div>
		</EditorSurfaceRegistryContext.Provider>
	);
}
