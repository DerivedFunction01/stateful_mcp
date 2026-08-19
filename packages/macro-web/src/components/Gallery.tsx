import { CheckCircle2, Code2, Palette, Terminal, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { createDiagnosticHostClient, type HostWorkspaceSnapshot } from "../lib/host-client";
import { useTheme, WEB_THEMES } from "../lib/theme";
import { BrowserEditorFixture } from "./BrowserEditorFixture";
import { Badge, Button, Card, Diagnostic, SelectField, TextInput, Toggle } from "./ui/primitives";

export function Gallery() {
	const { themeId, setThemeId, theme } = useTheme();
	const { locale, setLocale } = useI18n();
	return (
		<div className="gallery-page">
			<header className="page-header gallery-header"><div><span className="eyebrow">DEVELOPMENT ONLY</span><h1><Palette size={25} />Component gallery</h1><p>Responsive, accessible fixtures for the Macro web workbench.</p></div><div className="gallery-controls"><SelectField label="Theme" value={themeId} options={WEB_THEMES.map((item) => ({ id: item.id, label: item.label }))} onChange={(value) => setThemeId(value as typeof themeId)} /><SelectField label="Locale" value={locale} options={[{ id: "en", label: "English" }, { id: "es", label: "Español" }]} onChange={(value) => setLocale(value as "en" | "es")} /></div></header>
			<div className="story-grid">
				<Card title="Foundations" action={<Badge tone="accent">{theme.mode}</Badge>}><div className="button-row"><Button variant="primary" icon={<Zap size={15} />}>Primary action</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button></div><div className="badge-row"><Badge tone="success">Saved</Badge><Badge tone="warning">Unsaved</Badge><Badge tone="danger">3 errors</Badge><Badge tone="info">Host info</Badge></div></Card>
				<Card title="Form states"><div className="form-grid"><TextInput label="Macro title" defaultValue="Daily note" hint="A reusable title value." /><TextInput label="Invalid date" defaultValue="tomorrow-ish" error="Use a recognized date format." /></div><Toggle label="Enable domain suggestions" checked={true} onChange={() => undefined} /></Card>
				<Card title="Diagnostics"><div className="form-stack"><Diagnostic severity="info">This story is rendered from fixture data.</Diagnostic><Diagnostic severity="success">Macro preview is valid.</Diagnostic><Diagnostic severity="warning">The current profile has unsaved changes.</Diagnostic><Diagnostic severity="error">The date argument could not be parsed.</Diagnostic></div></Card>
				<Card title="Editor contexts" action={<Terminal size={17} />}><BrowserEditorFixture /></Card>
				<Card title="Theme swatches"><div className="swatch-grid">{["surface-canvas", "surface-primary", "surface-elevated", "content-primary", "content-secondary", "border-focus", "status-success", "status-danger"].map((name) => <div className="swatch" key={name}><span className={`swatch-color swatch-${name}`} /><code>--theme-{name}</code></div>)}</div></Card>
				<HostStory />
			</div>
		</div>
	);
}

function HostStory() {
	const [snapshot, setSnapshot] = useState<HostWorkspaceSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const client = createDiagnosticHostClient();
		void client.getSnapshot().then(setSnapshot).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
	}, []);
	return <Card title="Host-connected diagnostics" action={<Badge tone={error ? "danger" : snapshot ? "success" : "info"}>{error ? "Disconnected" : snapshot ? "Connected" : "Loading"}</Badge>}><div className="host-story"><div className="host-meta"><div><span className="field-label">Workspace</span><strong>{snapshot?.workspaceId ?? "—"}</strong></div><div><span className="field-label">Session</span><strong>{snapshot?.sessionId ?? "—"}</strong></div><div><span className="field-label">Profile</span><strong>{snapshot?.profile.id ?? "—"}</strong></div></div>{snapshot && <><div className="extension-list"><span className="field-label">Enabled domain applications</span>{snapshot.enabledExtensionIds.map((id) => <div className="extension-row" key={id}><span><CheckCircle2 size={15} />{id}</span><Badge tone="success">Active</Badge></div>)}</div>{snapshot.diagnostics.map((item) => <Diagnostic key={item.message} severity={item.severity}>{item.message}</Diagnostic>)}</>}{error && <Diagnostic severity="error">{error}</Diagnostic>}<p className="story-note"><Code2 size={15} />This story uses the same snapshot shape as the Bun host transport.</p></div></Card>;
}
