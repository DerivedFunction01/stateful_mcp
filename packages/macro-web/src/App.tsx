import { Activity, BookOpen, ChevronRight, Command, ExternalLink, FileText, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useI18n } from "./lib/i18n";
import { useTheme } from "./lib/theme";
import { Gallery } from "./components/Gallery";
import { SettingsTab } from "./components/SettingsTab";
import { StatusBar } from "./components/StatusBar";
import { Badge, Button, Card } from "./components/ui/primitives";

type Route = "workbench" | "settings" | "gallery" | "host";

export function App() {
	const { t } = useI18n();
	const { theme } = useTheme();
	const [route, setRoute] = useState<Route>(window.location.pathname.startsWith("/__dev") ? "gallery" : "workbench");
	const [vimEnabled] = useState(true);
	const navigate = (next: Route) => {
		setRoute(next);
		window.history.replaceState({}, "", next === "gallery" ? "/__dev/gallery" : next === "host" ? "/__dev/host" : next === "settings" ? "/settings" : "/");
	};
	return (
		<div className="app-shell">
			<aside className="activity-rail" aria-label={t("nav.workbench")}><div className="brand-mark"><Sparkles size={21} /></div><nav>{<NavButton label={t("nav.workbench")} icon={<Activity size={19} />} active={route === "workbench"} onClick={() => navigate("workbench")} />}{<NavButton label={t("nav.notes")} icon={<FileText size={19} />} active={false} onClick={() => navigate("workbench")} />}{<NavButton label={t("nav.settings")} icon={<Settings2 size={19} />} active={route === "settings"} onClick={() => navigate("settings")} />}</nav><div className="rail-bottom"><NavButton label={t("nav.gallery")} icon={<BookOpen size={19} />} active={route === "gallery"} onClick={() => navigate("gallery")} /><NavButton label={t("nav.host")} icon={<Command size={19} />} active={route === "host"} onClick={() => navigate("host")} /></div></aside>
			<div className="app-main"><header className="top-bar"><div className="breadcrumb"><span>Macro</span><ChevronRight size={14} /><strong>{route === "gallery" ? t("nav.gallery") : route === "settings" ? t("settings.title") : route === "host" ? t("app.host") : t("nav.workbench")}</strong></div><div className="top-actions"><Badge tone={theme.mode === "dark" ? "info" : "success"}>{theme.label}</Badge><Button variant="ghost" icon={<Command size={15} />} onClick={() => navigate("gallery")}>{t("nav.commandPalette")}</Button></div></header><main className="app-content">{route === "gallery" ? <Gallery /> : route === "settings" ? <SettingsTab /> : route === "host" ? <HostRoute /> : <WorkbenchPlaceholder vimEnabled={vimEnabled} onSettings={() => navigate("settings")} />}</main><StatusBar vimEnabled={vimEnabled} vimMode="NORMAL" editorFocused={route === "workbench"} diagnostics={route === "workbench" ? 1 : 0} onAction={(command) => { if (command === "workspace.selectProfile") navigate("settings"); if (command === "host.openDiagnostics") navigate("host"); }} /></div>
		</div>
	);
}

function NavButton({ label, icon, active, onClick }: { readonly label: string; readonly icon: React.ReactNode; readonly active: boolean; readonly onClick: () => void }) { return <button type="button" className={active ? "rail-button active" : "rail-button"} aria-label={label} title={label} onClick={onClick}>{icon}</button>; }

function WorkbenchPlaceholder({ vimEnabled, onSettings }: { readonly vimEnabled: boolean; readonly onSettings: () => void }) {
	const { t } = useI18n();
	return <div className="workbench-placeholder"><div className="welcome-mark"><Sparkles size={38} /></div><span className="eyebrow">{t("workbench.previewEyebrow")}</span><h1>{t("workbench.heading")}</h1><p>{t("workbench.description")}</p><div className="welcome-actions"><Button variant="primary" onClick={onSettings} icon={<Settings2 size={16} />}>{t("workbench.openSettings")}</Button><Button variant="secondary" icon={<ExternalLink size={16} />}>{t("workbench.openScratchpad")}</Button></div><div className="preview-grid"><Card title={t("workbench.currentSession")}><div className="session-lines"><span>{t("app.profile")} <strong>{t("settings.clinical")}</strong></span><span>{t("workbench.domainApps")} <strong>3</strong></span><span>{t("workbench.editorContext")} <strong>{vimEnabled ? t("workbench.vimEnabled") : t("workbench.browserNative")}</strong></span></div></Card><Card title={t("workbench.nextSurfaces")}><div className="session-lines"><span><BookOpen size={15} /> {t("settings.title")}</span><span><FileText size={15} /> {t("workbench.openScratchpad")}</span><span><Command size={15} /> {t("nav.commandPalette")}</span></div></Card></div></div>;
}

function HostRoute() { const { t } = useI18n(); return <div className="host-route"><div className="page-header"><div><span className="eyebrow">{t("gallery.eyebrow")}</span><h1><Command size={25} />{t("app.host")}</h1><p>{t("host.description")}</p></div></div><Card title={t("host.transport")}><div className="session-lines"><span>{t("host.http")} <Badge tone="info">/api/workspace/snapshot</Badge></span><span>{t("host.websocket")} <Badge tone="info">/api/workspace/events</Badge></span><span>{t("host.protocol")} <strong>{t("host.typed")}</strong></span></div><p className="story-note">{t("host.fixtureNote")}</p></Card></div>; }
