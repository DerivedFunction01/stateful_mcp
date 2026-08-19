import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
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
import { useEffect, useMemo, useState } from "react";
import { Gallery } from "./components/Gallery";
import { SettingsTab } from "./components/SettingsTab";
import { StatusBar } from "./components/StatusBar";
import { Badge, Button, Card } from "./components/ui/primitives";
import { WorkbenchShell } from "./components/WorkbenchShell";
import { normalizeBrowserChord, resolveKeymapCommand } from "./lib/bindings";
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
	useEffect(() => {
		if (!snapshot) return;
		const onKeyDown = (event: KeyboardEvent) => {
			const layout = snapshot.layout;
			const command = resolveKeymapCommand(
				normalizeBrowserChord(event),
				snapshot.keymap,
				"NORMAL",
				{
					activeTabId: snapshot.activeTabId,
					focusedPane:
						typeof layout.focusedPane === "string"
							? layout.focusedPane
							: undefined,
				},
			);
			if (!command) return;
			event.preventDefault();
			void store
				.executeCommand(command, [])
				.then(() => {
					if (command === "workspace.openSettings") setRoute("settings");
				})
				.catch(() => undefined);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [snapshot, store]);

	const navigate = (next: Route) => {
		setRoute(next);
		window.history.replaceState(
			{},
			"",
			next === "gallery"
				? "/__dev/gallery"
				: next === "host"
					? "/__dev/host"
					: next === "settings"
						? "/settings"
						: "/",
		);
	};
	const vimEnabled = Boolean(snapshot?.keymap);
	const diagnostics = snapshot?.diagnostics.length ?? 0;
	return (
		<div className="app-shell">
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
							onClick={() =>
								void store
									.executeCommand("workspace.openSettings")
									.catch(() => navigate("settings"))
							}
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
							errorMessage={workspaceState.transportError}
							onCommand={(command) => {
								void store
									.executeCommand(command)
									.then(() => {
										if (command === "workspace.openSettings")
											navigate("settings");
									})
									.catch(() => undefined);
							}}
						/>
					)}
				</main>
				<StatusBar
					vimEnabled={vimEnabled}
					vimMode="NORMAL"
					editorFocused={route === "workbench"}
					diagnostics={diagnostics}
					onAction={(command) => {
						if (command === "workspace.selectProfile") navigate("settings");
						if (command === "host.openDiagnostics") navigate("host");
					}}
				/>
			</div>
		</div>
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
		</div>
	);
}
