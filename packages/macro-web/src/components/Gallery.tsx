import type {
	CommandDescriptorDto,
	EditorMode,
	ScratchpadLineDto,
	SettingsPreviewDto,
} from "@stateful-mcp/macro-protocol";
import { CheckCircle2, Code2, Palette, Terminal, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { createDiagnosticHostClient } from "../dev/diagnostic-host-client";
import type { EditorSearchResult } from "../lib/browser-vim";
import type { HostWorkspaceSnapshot } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { useTheme, WEB_THEMES } from "../lib/theme";
import { BrowserEditorFixture } from "./BrowserEditorFixture";
import { CommandPalette } from "./CommandPalette";
import { EditorSurfaceView } from "./EditorSurfaceView";
import { FindOverlay } from "./FindOverlay";
import {
	Badge,
	Button,
	Card,
	Diagnostic,
	IconButton,
	ModalSurface,
	SelectField,
	TextInput,
	Toggle,
} from "./ui/primitives";

export function Gallery() {
	const { themeId, setThemeId, theme } = useTheme();
	const { locale, setLocale, t } = useI18n();
	return (
		<div className="gallery-page">
			<header className="page-header gallery-header">
				<div>
					<span className="eyebrow">{t("gallery.eyebrow")}</span>
					<h1>
						<Palette size={25} />
						{t("gallery.title")}
					</h1>
					<p>{t("gallery.description")}</p>
				</div>
				<div className="gallery-controls">
					<SelectField
						label={t("gallery.theme")}
						value={themeId}
						options={WEB_THEMES.map((item) => ({
							id: item.id,
							label: item.label,
						}))}
						onChange={(value) => setThemeId(value as typeof themeId)}
					/>
					<SelectField
						label={t("gallery.locale")}
						value={locale}
						options={[
							{ id: "en", label: t("common.english") },
							{ id: "es", label: t("common.spanish") },
						]}
						onChange={(value) => setLocale(value as "en" | "es")}
					/>
				</div>
			</header>
			<div className="story-grid">
				<Card
					title={t("gallery.foundations")}
					action={<Badge tone="accent">{theme.mode}</Badge>}
				>
					<div className="button-row">
						<Button variant="primary" icon={<Zap size={15} />}>
							{t("gallery.primary")}
						</Button>
						<Button variant="secondary">{t("gallery.secondary")}</Button>
						<Button variant="ghost">{t("gallery.ghost")}</Button>
						<Button variant="danger">{t("gallery.danger")}</Button>
					</div>
					<div className="badge-row">
						<Badge tone="success">Saved</Badge>
						<Badge tone="warning">Unsaved</Badge>
						<Badge tone="danger">3 errors</Badge>
						<Badge tone="info">Host info</Badge>
					</div>
				</Card>
				<OverlayControlsStory />
				<Card title={t("gallery.formStates")}>
					<div className="form-grid">
						<TextInput
							label="Macro title"
							defaultValue="Daily note"
							hint="A reusable title value."
						/>
						<TextInput
							label="Invalid date"
							defaultValue="tomorrow-ish"
							error="Use a recognized date format."
						/>
					</div>
					<Toggle
						label="Enable domain suggestions"
						checked={true}
						onChange={() => undefined}
					/>
				</Card>
				<Card title={t("gallery.diagnostics")}>
					<div className="form-stack">
						<Diagnostic severity="info">{t("gallery.fixtureInfo")}</Diagnostic>
						<Diagnostic severity="success">
							{t("gallery.previewValid")}
						</Diagnostic>
						<Diagnostic severity="warning">
							{t("gallery.profileWarning")}
						</Diagnostic>
						<Diagnostic severity="error">{t("gallery.dateError")}</Diagnostic>
					</div>
				</Card>
				<Card
					title={t("gallery.editorContexts")}
					action={<Terminal size={17} />}
				>
					<BrowserEditorFixture />
				</Card>
				<ScratchpadVisualStory />
				<FindWidgetStory />
				<Card title={t("gallery.themeSwatches")}>
					<div className="swatch-grid">
						{[
							"surface-canvas",
							"surface-primary",
							"surface-elevated",
							"content-primary",
							"content-secondary",
							"border-focus",
							"status-success",
							"status-danger",
						].map((name) => (
							<div className="swatch" key={name}>
								<span className={`swatch-color swatch-${name}`} />
								<code>--theme-{name}</code>
							</div>
						))}
					</div>
				</Card>
				<HostStory />
				<SettingsPreviewStory />
			</div>
		</div>
	);
}

const FIND_WIDGET_LINES: readonly ScratchpadLineDto[] = [
	{
		lineNumber: 1,
		rawText: "macro search preview",
		lineStatus: "non-macro",
		diagnostics: [],
	},
	{
		lineNumber: 2,
		rawText: "replace the macro token",
		lineStatus: "non-macro",
		diagnostics: [],
	},
];

function gallerySearchResult(query: string, direction: "forward" | "backward") {
	const matches =
		query === "macro"
			? [
					{ logicalLineIndex: 0, startOffset: 0, endOffset: 5 },
					{ logicalLineIndex: 1, startOffset: 12, endOffset: 17 },
				]
			: [];
	return {
		documentId: `gallery-find-${direction}`,
		textRevision: 1,
		matches,
		activeMatchIndex:
			matches.length > 0 ? (direction === "forward" ? 0 : 1) : -1,
	} satisfies EditorSearchResult;
}

function FindWidgetStory() {
	const { t } = useI18n();
	return (
		<Card title={t("gallery.findWidget.title")}>
			<div className="gallery-find-widget-grid">
				<div className="gallery-find-widget-preview">
					<strong>{t("gallery.findWidget.forward")}</strong>
					<EditorSurfaceView
						documentId="gallery-find-forward"
						lines={FIND_WIDGET_LINES}
						vimEnabled={false}
						onTextChange={() => undefined}
						searchWidget={
							<FindOverlay
								direction="forward"
								initialQuery="macro"
								initialReplacement="snippet"
								onFind={gallerySearchResult}
								onReplace={() => true}
								onReplaceAll={() => 2}
								onClose={() => undefined}
							/>
						}
					/>
				</div>
				<div className="gallery-find-widget-preview">
					<strong>{t("gallery.findWidget.noResults")}</strong>
					<EditorSurfaceView
						documentId="gallery-find-empty"
						lines={FIND_WIDGET_LINES}
						vimEnabled={false}
						onTextChange={() => undefined}
						searchWidget={
							<FindOverlay
								direction="backward"
								initialQuery="missing"
								initialReplacement="snippet"
								onFind={gallerySearchResult}
								onClose={() => undefined}
							/>
						}
					/>
				</div>
			</div>
		</Card>
	);
}

const GALLERY_COMMANDS: readonly CommandDescriptorDto[] = [
	{
		id: "workspace.openSettings",
		title: "Open Settings",
		category: "Workspace",
		description: "Open the application settings surface.",
		keybinding: "Ctrl+,",
	},
	{
		id: "editor.save",
		title: "Save Active Tab",
		category: "Editor",
		description: "Save the current editor document.",
		keybinding: "Ctrl+S",
	},
	{
		id: "editor.executeLine",
		title: "Execute Macro Line",
		category: "Macro",
		description: "Execute the selected logical macro line.",
		keybinding: "Enter",
		args: [
			{
				name: "line",
				required: true,
				type: "identifier",
				description: "Logical scratchpad line number",
			},
		],
	},
	{
		id: "workspace.openCommandPalette",
		title: "Open Command Palette with a Very Long Example Title",
		category: "Workbench",
		keybinding: "Ctrl+Shift+P",
	},
];

function OverlayControlsStory() {
	const [paletteOpen, setPaletteOpen] = useState(false);
	return (
		<Card
			title="Buttons and overlay surfaces"
			action={<Badge tone="info">reusable primitives</Badge>}
		>
			<div className="gallery-overlay-story">
				<div className="button-row">
					<Button variant="primary">Primary</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="danger">Danger</Button>
					<Button variant="primary" disabled>
						Disabled
					</Button>
					<IconButton label="Close preview">
						<X size={15} />
					</IconButton>
				</div>
				<div className="gallery-modal-preview">
					<ModalSurface className="gallery-modal-preview-surface">
						<strong>Reusable modal surface</strong>
						<span>Shared spacing, border, radius, and shadow.</span>
						<div className="page-actions">
							<Button variant="ghost">Cancel</Button>
							<Button variant="primary">Continue</Button>
						</div>
					</ModalSurface>
				</div>
				<Button
					variant="primary"
					icon={<Code2 size={15} />}
					onClick={() => setPaletteOpen(true)}
				>
					Open palette preview
				</Button>
			</div>
			{paletteOpen && (
				<CommandPalette
					commands={GALLERY_COMMANDS}
					initialQuery=""
					onExecute={async () => setPaletteOpen(false)}
					onClose={() => setPaletteOpen(false)}
				/>
			)}
		</Card>
	);
}

const GALLERY_SCRATCHPAD_LINES: readonly ScratchpadLineDto[] = [
	{
		lineNumber: 1,
		rawText: "test",
		lineStatus: "non-macro",
		diagnostics: [],
	},
	{
		lineNumber: 2,
		rawText: "harry potter 12/31/2025\nadditional borrow input\ncontinuation",
		macroName: "borrow",
		lineStatus: "valid",
		diagnostics: [],
	},
	{
		lineNumber: 3,
		rawText: "^other_macro argument\ncontinuation",
		macroName: "other_macro",
		lineStatus: "valid",
		diagnostics: [],
	},
	{
		lineNumber: 4,
		rawText: "",
		lineStatus: "empty",
		diagnostics: [],
	},
	{
		lineNumber: 5,
		rawText: "invalid input",
		lineStatus: "invalid",
		diagnostics: [
			{
				severity: "error",
				message: "Example diagnostic for the gallery",
			},
		],
	},
];

function ScratchpadVisualStory() {
	const { t } = useI18n();
	return (
		<Card
			title={t("gallery.scratchpad.visualStates")}
			action={<Badge tone="info">{t("gallery.scratchpad.logicalRows")}</Badge>}
		>
			<div className="gallery-scratchpad-grid">
				<ScratchpadModePreview
					label={t("gallery.scratchpad.insert")}
					mode="INSERT"
					activeCellIndex={1}
				/>
				<ScratchpadModePreview
					label={t("gallery.scratchpad.normal")}
					mode="NORMAL"
					activeCellIndex={2}
				/>
				<ScratchpadModePreview
					label={t("gallery.scratchpad.visual")}
					mode="VISUAL"
					activeCellIndex={2}
					selectedCellRange={{ start: 1, end: 2 }}
				/>
				<ScratchpadModePreview
					label={t("gallery.scratchpad.command")}
					mode="COMMAND"
					activeCellIndex={0}
				/>
				<ScratchpadModePreview
					label={t("gallery.scratchpad.native")}
					mode="INSERT"
					activeCellIndex={undefined}
					vimEnabled={false}
				/>
			</div>
		</Card>
	);
}

function ScratchpadModePreview({
	label,
	mode,
	activeCellIndex,
	selectedCellRange,
	vimEnabled = true,
}: {
	readonly label: string;
	readonly mode: EditorMode;
	readonly activeCellIndex?: number;
	readonly selectedCellRange?: { start: number; end: number };
	readonly vimEnabled?: boolean;
}) {
	return (
		<div className="gallery-scratchpad-preview">
			<strong>{label}</strong>
			<EditorSurfaceView
				documentId={`gallery-scratchpad-${label}`}
				lines={GALLERY_SCRATCHPAD_LINES}
				pinnedMacroIds={["borrow"]}
				vimEnabled={vimEnabled}
				vimMode={mode}
				activeCellIndex={activeCellIndex}
				selectedCellRange={selectedCellRange}
				onTextChange={() => undefined}
				onFocusChange={() => undefined}
				onCursorChange={() => undefined}
				onPointerTarget={() => undefined}
				onKeyDown={() => false}
				onExecuteLine={() => undefined}
				onExecuteRange={() => undefined}
				onPinMacro={() => undefined}
			/>
		</div>
	);
}

const GALLERY_PREVIEWS: readonly SettingsPreviewDto[] = [
	{
		requestId: "gallery-valid",
		settingsRevision: "gallery",
		providerId: "values.quantity",
		status: "valid",
		diagnostics: [],
		tokenDescriptors: [
			{
				id: "NUM",
				domain: "quantity",
				labelKey: "settings.tokens.quantity.NUM.label",
				descriptionKey: "settings.tokens.quantity.NUM.description",
			},
			{
				id: "UNIT",
				domain: "quantity",
				labelKey: "settings.tokens.quantity.UNIT.label",
				descriptionKey: "settings.tokens.quantity.UNIT.description",
			},
		],
		templateAnalysis: [
			{
				template: "NUM UNIT",
				tokens: ["NUM", "UNIT"],
				segments: [
					{ kind: "token", text: "NUM", start: 0, end: 3, tokenId: "NUM" },
					{ kind: "literal", text: " ", start: 3, end: 4 },
					{ kind: "token", text: "UNIT", start: 4, end: 8, tokenId: "UNIT" },
				],
				unknownTokens: [],
			},
		],
		sample: { input: "sample", matched: true, value: { kind: "quantity" } },
	},
	{
		requestId: "gallery-invalid",
		settingsRevision: "gallery",
		providerId: "values.frequency",
		status: "invalid",
		diagnostics: [
			{
				severity: "error",
				code: "UNKNOWN_TEMPLATE_TOKEN",
				message: "gallery.preview.unknownToken",
				path: ["values", "frequency", "templates"],
			},
		],
		templateAnalysis: [
			{
				template: "every <UNKNOWN>",
				tokens: [],
				segments: [
					{ kind: "literal", text: "every ", start: 0, end: 6 },
					{
						kind: "unknown-token",
						text: "UNKNOWN",
						start: 6,
						end: 15,
					},
				],
				unknownTokens: [
					{
						kind: "unknown-token",
						text: "UNKNOWN",
						start: 6,
						end: 15,
					},
				],
			},
		],
	},
];

function SettingsPreviewStory() {
	return (
		<Card title="Settings semantic preview variants">
			<div className="form-stack">
				{GALLERY_PREVIEWS.map((preview) => (
					<div key={preview.requestId} className="form-stack">
						<div className="badge-row">
							<Badge tone={preview.status === "valid" ? "success" : "danger"}>
								{preview.status}
							</Badge>
							<code>{preview.providerId}</code>
						</div>
						{preview.templateAnalysis?.map((analysis) => (
							<div key={analysis.template}>
								<strong>{analysis.template}</strong>
								<div>
									{analysis.segments.map((segment) => (
										<code
											key={`${segment.start}-${segment.end}`}
											className={`settings-preview-segment ${segment.kind}`}
										>
											{segment.text}
										</code>
									))}
								</div>
							</div>
						))}
						{preview.diagnostics.map((diagnostic, index) => (
							<Diagnostic
								key={`${diagnostic.code}-${index}`}
								severity={diagnostic.severity}
							>
								{diagnostic.message}
							</Diagnostic>
						))}
					</div>
				))}
			</div>
		</Card>
	);
}

function HostStory() {
	const { t } = useI18n();
	const [snapshot, setSnapshot] = useState<HostWorkspaceSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const client = createDiagnosticHostClient();
		void client
			.getSnapshot()
			.then(setSnapshot)
			.catch((reason: unknown) =>
				setError(reason instanceof Error ? reason.message : String(reason)),
			);
	}, []);
	return (
		<Card
			title={t("gallery.hostDiagnostics")}
			action={
				<Badge tone={error ? "danger" : snapshot ? "success" : "info"}>
					{error ? "Disconnected" : snapshot ? "Connected" : "Loading"}
				</Badge>
			}
		>
			<div className="host-story">
				<div className="host-meta">
					<div>
						<span className="field-label">{t("host.workspace")}</span>
						<strong>{snapshot?.workspaceId ?? "—"}</strong>
					</div>
					<div>
						<span className="field-label">{t("host.session")}</span>
						<strong>{snapshot?.sessionId ?? "—"}</strong>
					</div>
					<div>
						<span className="field-label">{t("host.profile")}</span>
						<strong>{snapshot?.profile.id ?? "—"}</strong>
					</div>
				</div>
				{snapshot && (
					<>
						<div className="extension-list">
							<span className="field-label">Enabled domain applications</span>
							{snapshot.enabledExtensionIds.map((id) => (
								<div className="extension-row" key={id}>
									<span>
										<CheckCircle2 size={15} />
										{id}
									</span>
									<Badge tone="success">{t("gallery.active")}</Badge>
								</div>
							))}
						</div>
						{snapshot.diagnostics.map((item) => (
							<Diagnostic key={item.message} severity={item.severity}>
								{item.message}
							</Diagnostic>
						))}
					</>
				)}
				{error && <Diagnostic severity="error">{error}</Diagnostic>}
				<p className="story-note">
					<Code2 size={15} />
					{t("gallery.hostFixture")}
				</p>
			</div>
		</Card>
	);
}
