import type {
	EditorOperation,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	Activity,
	BookOpen,
	ChevronRight,
	Command,
	ExternalLink,
	FileText,
	Settings2,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Gallery } from "./components/Gallery";
import { KeymapShortcuts } from "./components/KeymapShortcuts";
import { SettingsTab } from "./components/SettingsTab";
import { RegisteredStatusBar } from "./components/StatusBar";
import { Badge, Button, Card } from "./components/ui/primitives";
import { WorkbenchShell } from "./components/WorkbenchShell";
import {
	BrowserKeymapController,
	type KeymapAnnouncement,
} from "./lib/browser-keymap-controller";
import {
	EditorSurfaceRegistry,
	EditorSurfaceRegistryContext,
} from "./lib/editor-surface-registry";
import { trapFocus } from "./lib/focus-trap";
import {
	BrowserHostClient,
	type HostClient,
	type TransportState,
} from "./lib/host-client";
import { GalleryI18nScope, useI18n } from "./lib/macro-i18n-provider";
import { useTheme } from "./lib/theme";
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
	const { theme } = useTheme();
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
	const lastFocused = useRef<Element | null>(null);
	const [pendingNavigation, setPendingNavigation] = useState<{
		readonly route: Route;
		readonly restore: HTMLElement | null;
	}>();
	const navigationDialogRef = useRef<HTMLDivElement>(null);

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
	useEffect(() => {
		if (pendingNavigation)
			queueMicrotask(() => navigationDialogRef.current?.focus());
	}, [pendingNavigation]);
	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!settingsDirty) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [settingsDirty]);
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
	return (
		<EditorSurfaceRegistryContext.Provider value={registry}>
			<div className="app-shell">
				<div className="sr-only" aria-live="polite">
					{announcement}
				</div>
				<aside className="activity-rail" aria-label={t("nav.workbench")}>
					<div className="brand-mark">
						<Sparkles size={21} />
					</div>
					<nav>
						<NavButton
							label={t("nav.workbench")}
							icon={<Activity size={19} />}
							active={route === "workbench"}
							onClick={() => navigate("workbench")}
						/>
						<NavButton
							label={t("nav.notes")}
							icon={<FileText size={19} />}
							active={false}
							onClick={() => navigate("workbench")}
						/>
						<NavButton
							label={t("workspace.tab.settings")}
							icon={<Settings2 size={19} />}
							active={route === "settings"}
							onClick={() => navigate("settings")}
						/>
					</nav>
					<div className="rail-bottom">
						<NavButton
							label={t("nav.gallery")}
							icon={<BookOpen size={19} />}
							active={route === "gallery"}
							onClick={() => navigate("gallery")}
						/>
						<NavButton
							label={t("nav.host")}
							icon={<Command size={19} />}
							active={route === "host"}
							onClick={() => navigate("host")}
						/>
					</div>
				</aside>
				<div className="app-main">
					<header className="top-bar">
						<div className="breadcrumb">
							<span>Macro</span>
							<ChevronRight size={14} />
							<strong>
								{route === "gallery"
									? t("nav.gallery")
									: route === "settings"
										? t("workspace.tab.settings")
										: route === "host"
											? t("app.host")
											: t("nav.workbench")}
							</strong>
						</div>
						<div className="top-actions">
							<Badge tone={theme.mode === "dark" ? "info" : "success"}>
								{theme.label}
							</Badge>
							<Button
								variant="ghost"
								icon={<Command size={15} />}
								onClick={openPalette}
							>
								{t("nav.commandPalette")}
							</Button>
						</div>
					</header>
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
							/>
						)}
					</main>
					<RegisteredStatusBar
						profile={snapshot?.profile.displayName}
						domain={snapshot?.applications[0]?.displayName}
						diagnostics={diagnostics}
						onAction={(command) => {
							if (command === "workspace.selectProfile") navigate("settings");
							if (command === "host.openDiagnostics") navigate("host");
						}}
					/>
				</div>
				{pendingNavigation ? (
					<div className="modal-overlay" role="presentation">
						<div
							ref={navigationDialogRef}
							className="modal-card"
							role="dialog"
							aria-modal="true"
							aria-labelledby="navigation-guard-title"
							tabIndex={-1}
							onKeyDown={(event) => {
								trapFocus(event, navigationDialogRef.current);
								if (event.key === "Escape") {
									event.preventDefault();
									const restore = pendingNavigation.restore;
									setPendingNavigation(undefined);
									queueMicrotask(() => restore?.focus());
								}
							}}
						>
							<h2 id="navigation-guard-title">{t("settings.unsavedTitle")}</h2>
							<p>{t("settings.unsavedMessage")}</p>
							<div className="page-actions">
								<Button
									variant="ghost"
									onClick={() => {
										const restore = pendingNavigation.restore;
										setPendingNavigation(undefined);
										queueMicrotask(() => restore?.focus());
									}}
								>
									{t("settings.keepEditing")}
								</Button>
								<Button
									variant="ghost"
									onClick={() => void discardAndNavigate()}
								>
									{t("settings.discard")}
								</Button>
								<Button
									variant="primary"
									onClick={() => void saveAndNavigate()}
								>
									{t("settings.saveAndContinue")}
								</Button>
							</div>
						</div>
					</div>
				) : null}
				{paletteOpen ? (
					<CommandPalette
						commands={snapshot?.commands ?? []}
						onExecute={(command, args) => {
							return runCommand(command, args).then(closePalette);
						}}
						onClose={closePalette}
					/>
				) : null}
			</div>
		</EditorSurfaceRegistryContext.Provider>
	);
}

function NavButton({
	label,
	icon,
	active,
	onClick,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly active: boolean;
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={active ? "rail-button active" : "rail-button"}
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			{icon}
		</button>
	);
}

function WorkbenchPlaceholder({
	snapshot,
	vimEnabled,
	onSettings,
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly vimEnabled: boolean;
	readonly onSettings: () => void;
}) {
	const { t } = useI18n();
	return (
		<div className="workbench-placeholder">
			<div className="welcome-mark">
				<Sparkles size={38} />
			</div>
			<span className="eyebrow">{t("workbench.previewEyebrow")}</span>
			<h1>{t("workbench.heading")}</h1>
			<p>{t("workbench.description")}</p>
			<div className="welcome-actions">
				<Button
					variant="primary"
					onClick={onSettings}
					icon={<Settings2 size={16} />}
				>
					{t("workbench.openSettings")}
				</Button>
				<Button variant="secondary" icon={<ExternalLink size={16} />}>
					{t("workbench.openScratchpad")}
				</Button>
			</div>
			<div className="preview-grid">
				<Card title={t("workbench.currentSession")}>
					<div className="session-lines">
						<span>
							{t("app.profile")}{" "}
							<strong>
								{snapshot?.profile.displayName ?? t("common.loading")}
							</strong>
						</span>
						<span>
							{t("workbench.domainApps")}{" "}
							<strong>{snapshot?.applications.length ?? 0}</strong>
						</span>
						<span>
							{t("workbench.editorContext")}{" "}
							<strong>
								{vimEnabled
									? t("workbench.vimEnabled")
									: t("workbench.browserNative")}
							</strong>
						</span>
					</div>
				</Card>
				<Card title={t("workbench.nextSurfaces")}>
					<div className="session-lines">
						<span>
							<BookOpen size={15} /> {t("workspace.tab.settings")}
						</span>
						<span>
							<FileText size={15} /> {t("workbench.openScratchpad")}
						</span>
						<span>
							<Command size={15} /> {t("nav.commandPalette")}
						</span>
					</div>
				</Card>
			</div>
		</div>
	);
}

function HostRoute({
	snapshot,
	transport,
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly transport: TransportState;
}) {
	const { t } = useI18n();
	return (
		<div className="host-route">
			<div className="page-header">
				<div>
					<span className="eyebrow">{t("gallery.eyebrow")}</span>
					<h1>
						<Command size={25} />
						{t("app.host")}
					</h1>
					<p>{t("host.description")}</p>
				</div>
			</div>
			<Card title={t("host.transport")}>
				<div className="session-lines">
					<span>
						{t("host.workspace")}{" "}
						<strong>{snapshot?.workspaceId ?? t("common.loading")}</strong>
					</span>
					<span>
						{t("host.session")}{" "}
						<strong>{snapshot?.sessionId ?? t("common.loading")}</strong>
					</span>
					<span>
						{t("host.profile")}{" "}
						<strong>
							{snapshot?.profile.displayName ?? t("common.loading")}
						</strong>
					</span>
					<span>
						{t("host.transport")}{" "}
						<Badge tone={transport === "connected" ? "success" : "warning"}>
							{transport}
						</Badge>
					</span>
					<span>
						{t("host.protocol")} <strong>v1</strong>
					</span>
					<span>
						{t("host.websocket")}{" "}
						<strong>
							{snapshot
								? `${snapshot.revision} ${t("status.diagnostics")}`
								: t("common.loading")}
						</strong>
					</span>
				</div>
			</Card>
			{snapshot?.keymap ? (
				<Card title={t("palette.keymapHint")}>
					<KeymapShortcuts
						keymap={snapshot.keymap}
						commands={snapshot.commands}
					/>
				</Card>
			) : null}
		</div>
	);
}
