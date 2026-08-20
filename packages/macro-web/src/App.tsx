import type { EditorOperation } from "@stateful-mcp/macro-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityRail } from "./components/ActivityRail";
import { CommandPalette } from "./components/CommandPalette";
import { Gallery } from "./components/Gallery";
import { HostRoute } from "./components/HostRoute";
import { MenuBar } from "./components/MenuBar";
import { SettingsTab } from "./components/SettingsTab";
import { RegisteredStatusBar } from "./components/StatusBar";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { WorkbenchShell } from "./components/WorkbenchShell";
import {
	BrowserKeymapController,
	type KeymapAnnouncement,
} from "./lib/browser-keymap-controller";
import {
	EditorSurfaceRegistry,
	EditorSurfaceRegistryContext,
} from "./lib/editor-surface-registry";
import { BrowserHostClient, type HostClient } from "./lib/host-client";
import { GalleryI18nScope, useI18n } from "./lib/macro-i18n-provider";
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

	function openPalette(): void {
		lastFocused.current = document.activeElement;
		setPaletteOpen(true);
	}

	function closePalette(): void {
		setPaletteOpen(false);
		if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
	}

	function announce(message: KeymapAnnouncement): void {
		const text =
			message.key === "chord.prefix"
				? `${t("keymap.chordPrefix")} ${message.chord}`
				: message.key === "shortcut.unavailable"
					? `${t("keymap.shortcutUnavailable")} ${message.chord}`
					: message.key === "shortcut.conditional"
						? `${t("keymap.shortcutConditional")} ${message.chord}`
						: t(`keymap.${message.key}`);
		setAnnouncement(text);
	}

	async function runCommand(
		command: string,
		args?: readonly unknown[],
	): Promise<void> {
		await store.executeCommand(command, args);
		if (
			command === "workspace.openSettings" ||
			command === "workspace.toggleSettings"
		)
			requestNavigate("settings");
	}

	useEffect(() => {
		const controller = new BrowserKeymapController({
			getSnapshot: () => snapshot,
			getContext: () => {
				const active = registry.getActive();
				if (active) {
					return { editorFocused: true, context: active.context };
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
			onCommand: (command) => runCommand(command),
			onCommandError: () => setAnnouncement(t("palette.executionFailed")),
			announce,
		});
		controller.attach(window);
		return () => controller.dispose();
	}, [snapshot, store, registry]);

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
						void store.executeCommand(cmd, args);
					}}
					onOpenPalette={openPalette}
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
								onSetEditorDraft={(documentId, text) =>
									store.setEditorDraft(documentId, text)
								}
								onReloadEditorConflict={() => store.reloadEditorConflict()}
								onOverwriteEditorConflict={() =>
									void store.overwriteEditorConflict()
								}
								onEditorCursorChange={setEditorCursor}
							/>
						)}
					</main>
				</div>

				<RegisteredStatusBar
					profile={snapshot?.profile.displayName}
					domain={snapshot?.applications[0]?.displayName}
					diagnostics={diagnostics}
					cursor={editorCursor}
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
						commands={snapshot?.commands ?? []}
						onExecute={(command, args) => {
							return runCommand(command, args).then(closePalette);
						}}
						onClose={closePalette}
					/>
				)}
			</div>
		</EditorSurfaceRegistryContext.Provider>
	);
}
