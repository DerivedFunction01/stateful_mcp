import type {
	CommandDescriptorDto,
	DiagnosticDto,
	EditorMode,
	EditorOutputSnapshotDto,
	PinnedMacroDto,
	ScratchpadLineDto,
	ScratchpadSnapshotDto,
	SearchDirection,
	SettingsPreviewDto,
	SidepanelPosition,
} from "@stateful-mcp/macro-protocol";
import {
	Activity,
	BookTemplate,
	CheckCircle2,
	Code2,
	Database,
	Download,
	FolderGit2,
	FolderPlus,
	Palette,
	Pin,
	Play,
	RotateCcw,
	Save,
	Terminal,
	Trash2,
	Upload,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createDiagnosticHostClient } from "../dev/diagnostic-host-client";
import type { EditorSearchResult } from "../lib/browser-vim";
import type { HostWorkspaceSnapshot } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { resolveThrownError } from "../lib/message-resolver";
import { resolveDiagnosticMessage } from "./inspector/inspector-utils";
import type { InspectorDiagnosticItem } from "./inspector/inspector-types";
import { useTheme, WEB_THEMES } from "../lib/theme";
import {
	exportUserPreferencesBundle,
	getActiveUserPreferencesBackendKind,
	importUserPreferencesBundle,
	loadUserPreferences,
	migrateUserPreferencesBackend,
	saveUserPreferences,
} from "../lib/user-preferences-storage";
import { BrowserEditorFixture } from "./BrowserEditorFixture";
import { CommandPalette } from "./CommandPalette";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import { EditorSurfaceView } from "./EditorSurfaceView";
import { FindOverlay } from "./FindOverlay";
import { MenuBar } from "./MenuBar";
import { OpenFolderModal } from "./OpenFolderModal";
import { PinnedMacroBar } from "./PinnedMacroBar";
import { ProjectInitModal } from "./ProjectInitModal";
import { TemplatePickerModal } from "./TemplatePickerModal";
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
import { WorkbenchInspector } from "./WorkbenchInspector";
import { JournalPaneBody } from "./workbench/PrimarySidebarJournal";

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
							label: t(item.labelKey),
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
						onChange={(value) => setLocale(value)}
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
						<Badge tone="success">{t("gallery.badge.saved")}</Badge>
						<Badge tone="warning">{t("gallery.badge.unsaved")}</Badge>
						<Badge tone="danger">
							{t("gallery.badge.errors", { count: 3 })}
						</Badge>
						<Badge tone="info">{t("gallery.badge.hostInfo")}</Badge>
					</div>
				</Card>
				<OverlayControlsStory />
				<ProjectFolderModalStory />
				<ExecutionToolbarAndUndoStory />
				<UserPreferencesStory />
				<MenuBarStory />
				<JournalHistoryStory />
				<WorkbenchInspectorStory />
				<QuickRunChipsBarStory />
				<IslandsOfOrderAndDisambiguationStory />
				<TemplatePickerStory />
				<PinnedMacroBarStory />
				<ProjectInitModalStory />
				<Card title={t("gallery.formStates")}>
					<div className="form-grid">
						<TextInput
							label={t("gallery.form.titleLabel")}
							defaultValue={t("gallery.form.titleDefault")}
							hint={t("gallery.form.titleHint")}
						/>
						<TextInput
							label={t("gallery.form.invalidDate")}
							defaultValue={t("gallery.form.dateDefault")}
							error={t("gallery.form.dateError")}
						/>
					</div>
					<Toggle
						label={t("gallery.form.enableSuggestions")}
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

function ProjectFolderModalStory() {
	const { t } = useI18n();
	const [modalMode, setModalMode] = useState<
		"open" | "init" | "saveAs" | undefined
	>();
	const client = useMemo(() => createDiagnosticHostClient(), []);

	return (
		<Card
			title="Remote Project QuickPick Modal"
			action={<Badge tone="accent">Server-Driven</Badge>}
		>
			<p className="story-note">
				Browse remote filesystem paths, detect <code>.macro/project.json</code>{" "}
				roots, and initialize or save workspaces.
			</p>
			<div className="button-row" style={{ marginTop: 12 }}>
				<Button
					variant="primary"
					icon={<FolderGit2 size={14} />}
					onClick={() => setModalMode("open")}
				>
					{t("project.openProjectTitle")}
				</Button>
				<Button
					variant="secondary"
					icon={<FolderPlus size={14} />}
					onClick={() => setModalMode("init")}
				>
					{t("project.initProjectTitle")}
				</Button>
				<Button
					variant="ghost"
					icon={<Save size={14} />}
					onClick={() => setModalMode("saveAs")}
				>
					{t("project.saveAsProjectTitle")}
				</Button>
			</div>

			{modalMode && (
				<OpenFolderModal
					mode={modalMode}
					client={client}
					initialPath="/home/denny/projects"
					onClose={() => setModalMode(undefined)}
					onSelect={(_path: string) => {
						setModalMode(undefined);
					}}
				/>
			)}
		</Card>
	);
}

function ExecutionToolbarAndUndoStory() {
	const { t } = useI18n();
	const [drawerOutput, setDrawerOutput] = useState<EditorOutputSnapshotDto>({
		entries: [
			{
				outputId: "entry-1",
				availability: "available",
				lineNumber: 1,
				status: "committed",
				executedAt: Date.now() - 60000,
				result: {
					kind: "vitals",
					schemaVersion: 1,
					availability: "available",
					data: { bp: "120/80", hr: 72 },
				},
			},
			{
				outputId: "entry-2",
				availability: "available",
				lineNumber: 2,
				status: "reversed",
				executedAt: Date.now() - 30000,
				result: {
					kind: "dx",
					schemaVersion: 1,
					availability: "available",
					data: { code: "I10", name: "Essential hypertension" },
				},
			},
			{
				outputId: "entry-3",
				availability: "available",
				lineNumber: 3,
				status: "committed",
				executedAt: Date.now() - 5000,
				result: {
					kind: "order",
					schemaVersion: 1,
					availability: "available",
					data: { test: "CBC", priority: "STAT" },
				},
			},
		],
		hasMore: false,
	});

	return (
		<Card
			title="Cell Execution Toolbar & Reversal Journal"
			action={<Badge tone="info">Two-Tier Undo</Badge>}
		>
			<p className="story-note">
				Execute valid lines, clear executed cells, reset execution state, and
				perform two-tier macro reversals.
			</p>

			{/* Simulated Scratchpad Action Toolbar */}
			<div
				className="editor-execution-actions"
				style={{
					display: "flex",
					gap: 8,
					padding: "8px 12px",
					background: "var(--theme-surface-primary)",
					borderRadius: 6,
					border: "1px solid var(--theme-border-subtle)",
					margin: "12px 0",
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<button
					type="button"
					className="editor-toolbar-btn run-all-btn"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "4px 8px",
						borderRadius: 4,
						fontSize: 12,
						background: "var(--theme-surface-elevated)",
						border: "1px solid var(--theme-border-default)",
						color: "var(--theme-content-primary)",
					}}
				>
					<Play size={13} />
					<span>{t("editor.execution.validLines")}</span>
				</button>
				<button
					type="button"
					className="editor-toolbar-btn clear-executed-btn"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "4px 8px",
						borderRadius: 4,
						fontSize: 12,
						background: "var(--theme-surface-elevated)",
						border: "1px solid var(--theme-border-default)",
						color: "var(--theme-content-primary)",
					}}
				>
					<Trash2 size={13} />
					<span>{t("editor.clearExecuted")}</span>
				</button>
				<button
					type="button"
					className="editor-toolbar-btn reset-exec-btn"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "4px 8px",
						borderRadius: 4,
						fontSize: 12,
						background: "var(--theme-surface-elevated)",
						border: "1px solid var(--theme-border-default)",
						color: "var(--theme-content-primary)",
					}}
				>
					<RotateCcw size={13} />
					<span>{t("editor.resetExecution")}</span>
				</button>

				<div
					style={{
						width: 1,
						height: 16,
						background: "var(--theme-border-subtle)",
						margin: "0 4px",
					}}
				/>

				{/* Pinned & Frequent Macro Quick-Run Chips */}
				<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
					<span
						style={{
							fontSize: 11,
							color: "var(--theme-content-tertiary)",
							display: "flex",
							alignItems: "center",
							gap: 3,
						}}
					>
						<Pin size={11} /> Quick-Run:
					</span>
					<span
						style={{
							padding: "2px 6px",
							borderRadius: 4,
							fontSize: 11,
							background:
								"color-mix(in srgb, var(--theme-content-accent) 15%, transparent)",
							color: "var(--theme-content-accent)",
							border: "1px solid var(--theme-content-accent)",
							fontFamily: "monospace",
							cursor: "pointer",
						}}
					>
						^vitals
					</span>
					<span
						style={{
							padding: "2px 6px",
							borderRadius: 4,
							fontSize: 11,
							background:
								"color-mix(in srgb, var(--theme-content-accent) 15%, transparent)",
							color: "var(--theme-content-accent)",
							border: "1px solid var(--theme-content-accent)",
							fontFamily: "monospace",
							cursor: "pointer",
						}}
					>
						^dx
					</span>
					<span
						style={{
							padding: "2px 6px",
							borderRadius: 4,
							fontSize: 11,
							background:
								"color-mix(in srgb, var(--theme-status-info) 15%, transparent)",
							color: "var(--theme-status-info)",
							border: "1px solid var(--theme-status-info)",
							fontFamily: "monospace",
							cursor: "pointer",
						}}
					>
						^order
					</span>
				</div>
			</div>

			{/* Embedded Output Drawer Preview */}
			<div
				style={{
					border: "1px solid var(--theme-border-default)",
					borderRadius: 6,
					overflow: "hidden",
				}}
			>
				<EditorOutputDrawer
					output={drawerOutput}
					defaultOpen={true}
					onReverseEntry={async (entryId) => {
						setDrawerOutput((prev) => ({
							...prev,
							entries: prev.entries.map((entry) =>
								entry.outputId === entryId
									? {
											...entry,
											status: "reversed" as const,
											reversalReceipt: `REV-${Math.floor(Math.random() * 1000)}`,
										}
									: entry,
							),
						}));
					}}
				/>
			</div>
		</Card>
	);
}

function UserPreferencesStory() {
	const [prefs, setPrefs] = useState(() => loadUserPreferences());
	const [backendKind, setBackendKind] = useState(() =>
		getActiveUserPreferencesBackendKind(),
	);
	const [statusMessage, setStatusMessage] = useState<string>("");

	const handleToggleVim = () => {
		const next = !prefs.vimEnabled;
		const updated = saveUserPreferences({ vimEnabled: next });
		setPrefs(updated);
	};

	const handleTogglePurge = () => {
		const next = !prefs.autoPurgeOnExecute;
		const updated = saveUserPreferences({ autoPurgeOnExecute: next });
		setPrefs(updated);
	};

	const handleMigrateBackend = async (
		target: "indexeddb" | "localstorage" | "memory",
	) => {
		await migrateUserPreferencesBackend(target);
		setBackendKind(target);
		setStatusMessage(`Migrated preferences storage to ${target}`);
	};

	const handleExport = async () => {
		const bundle = await exportUserPreferencesBundle();
		const blob = new Blob([JSON.stringify(bundle, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `macro-user-preferences-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		setStatusMessage("Exported preferences bundle as JSON download");
	};

	const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const bundle = JSON.parse(text);
			const updated = await importUserPreferencesBundle(bundle);
			setPrefs(updated);
			setStatusMessage(`Successfully imported preferences from ${file.name}`);
		} catch (err: any) {
			setStatusMessage(`Failed to import preferences: ${err?.message}`);
		}
	};

	return (
		<Card
			title="Universal User Preferences (Pluggable KvBackend Storage)"
			action={
				<Badge tone="accent">
					<Database size={11} style={{ marginRight: 4 }} />
					{backendKind}
				</Badge>
			}
		>
			<p className="story-note">
				User-tier settings backed by pluggable <code>KvBackend</code> drivers
				(IndexedDB / LocalStorage / Memory / Server JSONL).
			</p>
			<div className="form-grid" style={{ marginTop: 12 }}>
				<div>
					<span className="field-label">Active Keymap Profile</span>
					<strong>{prefs.keymapProfile}</strong>
				</div>
				<div>
					<span className="field-label">Active Theme</span>
					<strong>{prefs.theme}</strong>
				</div>
				<div>
					<span className="field-label">Inspector Position</span>
					<strong>{prefs.inspectorPosition ?? "right"}</strong>
				</div>
				<div>
					<span className="field-label">Storage Backend</span>
					<code>{backendKind}</code>
				</div>
			</div>
			<div className="form-stack" style={{ marginTop: 12 }}>
				<Toggle
					label="Enable Vim Modal Emulation"
					checked={prefs.vimEnabled}
					onChange={handleToggleVim}
				/>
				<Toggle
					label="Auto-Purge Executed Lines on Enter"
					checked={Boolean(prefs.autoPurgeOnExecute)}
					onChange={handleTogglePurge}
				/>
			</div>

			<div
				style={{
					marginTop: 16,
					paddingTop: 12,
					borderTop: "1px solid var(--theme-border-subtle)",
					display: "flex",
					flexDirection: "column",
					gap: 10,
				}}
			>
				<span className="field-label">Storage Backend & Migration</span>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<Button
						variant={backendKind === "indexeddb" ? "primary" : "secondary"}
						onClick={() => handleMigrateBackend("indexeddb")}
					>
						IndexedDB (Default)
					</Button>
					<Button
						variant={backendKind === "localstorage" ? "primary" : "secondary"}
						onClick={() => handleMigrateBackend("localstorage")}
					>
						LocalStorage (Fallback)
					</Button>
					<Button
						variant={backendKind === "memory" ? "primary" : "secondary"}
						onClick={() => handleMigrateBackend("memory")}
					>
						Memory (Ephemeral)
					</Button>
				</div>

				<div style={{ display: "flex", gap: 8, marginTop: 4 }}>
					<Button
						variant="secondary"
						icon={<Download size={13} />}
						onClick={handleExport}
					>
						Export JSON Bundle
					</Button>
					<label style={{ cursor: "pointer" }}>
						<Button
							variant="secondary"
							icon={<Upload size={13} />}
							onClick={() => {
								document.getElementById("import-pref-input")?.click();
							}}
						>
							Import JSON Bundle
						</Button>
						<input
							id="import-pref-input"
							type="file"
							accept=".json,application/json"
							style={{ display: "none" }}
							onChange={handleImport}
						/>
					</label>
				</div>

				{statusMessage && (
					<div
						className="cell-raw-preview"
						style={{ padding: 8, color: "var(--theme-accent)" }}
					>
						<strong>Status: </strong>
						<span>{statusMessage}</span>
					</div>
				)}
			</div>
		</Card>
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

function gallerySearchResult(query: string, direction: SearchDirection) {
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
		titleI18nKey: "workbench.openSettings",
		categoryI18nKey: "common.workspace",
		description: "Open the application settings surface.",
		keybinding: "Ctrl+,",
	},
	{
		id: "editor.save",
		titleI18nKey: "menu.save",
		categoryI18nKey: "common.editor",
		description: "Save the current editor document.",
		keybinding: "Ctrl+S",
	},
	{
		id: "editor.executeLine",
		titleI18nKey: "editor.execution.line",
		categoryI18nKey: "common.editor",
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
		titleI18nKey: "palette.title",
		categoryI18nKey: "common.workspace",
		keybinding: "Ctrl+Shift+P",
	},
	{
		id: "workbench.view.journal",
		titleI18nKey: "menu.view.journal",
		categoryI18nKey: "menu.view",
		description: "Open the Journal History pane in the primary sidebar.",
		keybinding: "Ctrl+Shift+J",
	},
	{
		id: "journal.reverseLast",
		titleI18nKey: "journal.reverseLast",
		categoryI18nKey: "journal.title",
		description: "Revert the most recent committed transaction.",
		keybinding: "Ctrl+Alt+Z",
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
				message: "",
				messageKey: "common.error",
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
	const i18n = useI18n();
	const { t } = i18n;
	const [snapshot, setSnapshot] = useState<HostWorkspaceSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const client = createDiagnosticHostClient();
		void client
			.getSnapshot()
			.then(setSnapshot)
			.catch((reason: unknown) => setError(resolveThrownError(i18n, reason)));
	}, [i18n]);
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
						{snapshot.diagnostics.map((item, index) => (
							<Diagnostic
								key={`${item.code}-${index}`}
								severity={item.severity}
							>
								{resolveDiagnosticMessage(
									{ line: 0, macroName: undefined, ...item } as InspectorDiagnosticItem,
									t,
								)}
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

function WorkbenchInspectorStory() {
	const { t } = useI18n();
	const [activeLine, setActiveLine] = useState(0);
	const [dockPosition, setDockPosition] = useState<SidepanelPosition>("right");
	const [isOpen, setIsOpen] = useState(true);

	const mockSnapshot: ScratchpadSnapshotDto = {
		documentId: "doc-1",
		textRevision: 1,
		lines: [
			{
				lineNumber: 1,
				rawText: "^vitals bp=120/80 hr=72",
				macroName: "vitals",
				lineStatus: "valid",
				diagnostics: [],
				projections: [
					{
						kind: "extension",
						payload: {
							kind: "vitals",
							schemaVersion: 1,
							availability: "available",
							data: { bp: "120/80", hr: 72 },
						},
					},
				],
			},
			{
				lineNumber: 2,
				rawText: "^box 20m something 15m prism 12m",
				macroName: "box",
				lineStatus: "valid",
				diagnostics: [],
				projections: [
					{
						kind: "extension",
						payload: {
							kind: "box_dimensions",
							schemaVersion: 1,
							availability: "available",
							data: {
								length: "20m",
								width: "15m",
								height: "12m",
								shape: "prism",
								name: "something",
							},
						},
					},
				],
			},
			{
				lineNumber: 3,
				rawText: "^vitals bp=invalid_bp",
				macroName: "vitals",
				lineStatus: "invalid",
			diagnostics: ([
				{
					code: "invalidBloodPressure",
					messageKey: "errors.invalidBloodPressure",
					severity: "error",
					span: { start: 11, end: 21 },
				},
			] as unknown) as readonly DiagnosticDto[],
				projections: [],
			},
			{
				lineNumber: 4,
				rawText: "^evaluacion #asma con #sibilancias",
				macroName: "evaluacion",
				lineStatus: "valid",
			diagnostics: ([
				{
					code: "conceptUnverified",
					messageKey: "errors.conceptUnverified",
					messageParams: { term: "sibilancias", confidence: 92 },
					severity: "warning",
					span: { start: 22, end: 34 },
				},
			] as unknown) as readonly DiagnosticDto[],
				projections: [
					{
						kind: "extension",
						payload: {
							kind: "clinical_assessment",
							schemaVersion: 1,
							availability: "available",
							data: { dx: "asma", hallazgos: ["sibilancias"] },
						},
					},
				],
			},
		],
	};

	const mockPinned: PinnedMacroDto[] = [
		{
			id: "pin:vitals",
			macroName: "vitals",
			title: "Vital Signs Quick-Run",
			source: "project",
			snippet: "^vitals bp=120/80 hr=72",
		},
		{
			id: "freq:box",
			macroName: "box",
			title: "3D Bounding Box (Sub-Ordered)",
			source: "frequent",
			executionCount: 7,
			snippet: "^box 20m 15m 12m prism",
		},
		{
			id: "ext:evaluacion",
			macroName: "evaluacion",
			title: "Evaluación Clínica",
			source: "extension",
			snippet: "^evaluacion #",
		},
	];

	const sampleContributedViews = [
		{
			id: "clinical.telemetry",
			name: "Patient Telemetry",
			icon: Activity,
			render: () => (
				<div
					style={{
						padding: 12,
						display: "flex",
						flexDirection: "column",
						gap: 8,
					}}
				>
					<Badge tone="accent">@clinical:telemetry</Badge>
					<p
						style={{
							fontSize: 12,
							color: "var(--theme-content-secondary)",
							margin: 0,
						}}
					>
						Live FHIR Trend: Blood Pressure stable at 120/80 mmHg, HR 72 bpm.
					</p>
				</div>
			),
		},
	];

	return (
		<Card
			title={t("gallery.inspectorTitle")}
			action={<Badge tone="accent">{t("gallery.richSidepanel")}</Badge>}
		>
			<div
				style={{
					height: 420,
					border: "1px solid var(--theme-border-subtle)",
					borderRadius: 6,
					overflow: "hidden",
				}}
			>
				<WorkbenchInspector
					document={mockSnapshot}
					meta={{
						documentId: "doc-1",
						providerId: "macro.text",
						title: "scratchpad.macro",
						dirty: false,
						textRevision: 1,
					}}
					activeLineIndex={activeLine}
					pinnedMacros={mockPinned}
					isOpen={isOpen}
					onToggleOpen={() => setIsOpen((prev) => !prev)}
					dockPosition={dockPosition}
					onToggleDockPosition={() =>
						setDockPosition((prev) => (prev === "right" ? "left" : "right"))
					}
					contributedViews={sampleContributedViews}
					onJumpToLine={(line) => setActiveLine(line - 1)}
				/>
			</div>
		</Card>
	);
}

function QuickRunChipsBarStory() {
	const { t } = useI18n();
	const [activeSnippet, setActiveSnippet] = useState<string>("");
	const sampleMacros: PinnedMacroDto[] = [
		{
			id: "p1",
			macroName: "vitals",
			source: "project",
			title: "Project: Vital signs",
		},
		{
			id: "p2",
			macroName: "box",
			source: "frequent",
			executionCount: 12,
			title: "Frequent: 3D Box",
		},
		{
			id: "p3",
			macroName: "dx",
			source: "extension",
			title: "Extension: Diagnosis",
		},
		{
			id: "p4",
			macroName: "evaluacion",
			source: "extension",
			title: "Extension: Clinical evaluation",
		},
	];

	return (
		<Card
			title={t("gallery.quickrunTitle")}
			action={<Badge tone="info">{t("gallery.noEmojis")}</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div
					className="editor-quickrun-bar"
					style={{
						background: "var(--theme-surface-secondary)",
						padding: "6px 10px",
						borderRadius: 6,
					}}
				>
					<span className="quickrun-label">
						<Pin size={11} />
					</span>
					{sampleMacros.map((macro) => (
						<button
							key={macro.id}
							type="button"
							className={`quickrun-chip quickrun-${macro.source}`}
							onClick={() =>
								setActiveSnippet(
									`^${macro.macroName} ... (inserted via quick-run chip)`,
								)
							}
						>
							^{macro.macroName}
							{macro.executionCount && (
								<span className="chip-count-badge">{macro.executionCount}</span>
							)}
						</button>
					))}
				</div>
				{activeSnippet && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Inserted: </strong>
						<code>{activeSnippet}</code>
					</div>
				)}
			</div>
		</Card>
	);
}

function IslandsOfOrderAndDisambiguationStory() {
	const { t } = useI18n();
	return (
		<Card
			title={t("gallery.islandsTitle")}
			action={<Badge tone="accent">Engine</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div className="suborder-flow-badge" style={{ margin: 0 }}>
					<div className="suborder-title">
						{t("workbench.boundProjections")} (length, width, height)
					</div>
					<p
						style={{
							fontSize: 11.5,
							color: "var(--theme-content-secondary)",
							margin: "4px 0",
						}}
					>
						Input: <code>^box 20m something 15m prism 12m</code>
					</p>
					<div className="suborder-tokens">
						<span className="token-chip">length = 20m (pos: 0)</span>
						<span className="token-chip">name = "something" (unordered)</span>
						<span className="token-chip">width = 15m (pos: 1)</span>
						<span className="token-chip">shape = "prism" (unordered)</span>
						<span className="token-chip">height = 12m (pos: 2)</span>
					</div>
				</div>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 8,
					}}
				>
					<div className="pinned-macro-card">
						<div className="pinned-card-title">
							<strong>@clinical:vitals</strong>
							<Badge tone="accent">{t("workbench.activeExtension")}</Badge>
						</div>
						<span className="pinned-card-desc">
							Provides <code>bp</code>, <code>hr</code> slots (aliases:{" "}
							<code>v</code>, <code>vits</code>)
						</span>
					</div>
					<div className="pinned-macro-card">
						<div className="pinned-card-title">
							<strong>@apple-health:vitals</strong>
							<Badge tone="neutral">{t("workbench.availableExtension")}</Badge>
						</div>
						<span className="pinned-card-desc">
							Provides <code>bp</code>, <code>steps</code> (alias:{" "}
							<code>apple-vitals</code>)
						</span>
					</div>
				</div>
			</div>
		</Card>
	);
}

function MenuBarStory() {
	const { t } = useI18n();
	const [lastTriggered, setLastTriggered] = useState<string>("");
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [inspectorOpen, setInspectorOpen] = useState(true);
	const [inspectorPos, setInspectorPos] = useState<SidepanelPosition>("right");

	return (
		<Card
			title="Declarative Menu Bar & Top-Right Layout Controls"
			action={<Badge tone="accent">QoL / UI</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div
					style={{
						height: 38,
						background: "var(--theme-surface-secondary)",
						border: "1px solid var(--theme-border-subtle)",
						borderRadius: 6,
						padding: "0 8px",
						display: "flex",
						alignItems: "center",
					}}
				>
					<MenuBar
						activeDocumentTitle="scratchpad.macro"
						onCommand={(cmd) => setLastTriggered(`Command: ${cmd}`)}
						onOpenPalette={() => setLastTriggered("Action: Open Palette")}
						onOpenFolderModal={(mode) =>
							setLastTriggered(`Action: Open Project Modal (${mode})`)
						}
						onNavigate={(route) => setLastTriggered(`Navigate: ${route}`)}
						currentRoute="gallery"
						isSidebarOpen={sidebarOpen}
						onToggleSidebar={() => {
							setSidebarOpen((prev) => !prev);
							setLastTriggered(`Toggle Sidebar: ${!sidebarOpen}`);
						}}
						isDrawerOpen={drawerOpen}
						onToggleDrawer={() => {
							setDrawerOpen((prev) => !prev);
							setLastTriggered(`Toggle Drawer: ${!drawerOpen}`);
						}}
						isInspectorOpen={inspectorOpen}
						onToggleInspector={() => {
							setInspectorOpen((prev) => !prev);
							setLastTriggered(`Toggle Inspector: ${!inspectorOpen}`);
						}}
						inspectorPosition={inspectorPos}
						onSetInspectorPosition={(pos) => {
							setInspectorPos(pos);
							setLastTriggered(`Set Inspector Position: ${pos}`);
						}}
					/>
				</div>
				{lastTriggered && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Triggered: </strong>
						<code>{lastTriggered}</code>
					</div>
				)}
			</div>
		</Card>
	);
}

function JournalHistoryStory() {
	const { t } = useI18n();
	const [lastAction, setLastAction] = useState<string>("");

	const mockSnapshot: any = {
		editor: {
			output: {
				hasMore: false,
				entries: [
					{
						outputId: "journal_1724431200000_8f2a1b",
						availability: "available",
						lineNumber: 14,
						rawText: "^v #bp 120/80 #hr 72",
						macroId: "@stateful-mcp/clinical:vitals",
						invokedAs: "v",
						status: "committed",
						result: {
							facets: {
								text: "Blood Pressure: 120/80 mmHg (Sitting, Right Arm), Pulse: 72 bpm.",
								data: {
									systolic: 120,
									diastolic: 80,
									pulse: 72,
									unit: "mmHg",
								},
							},
							fingerprint:
								"8f2a1b9c4e20d6f78a12bc443189ef00a918471b63ef21098877665544332211",
						},
						fingerprint:
							"8f2a1b9c4e20d6f78a12bc443189ef00a918471b63ef21098877665544332211",
						executedAt: Date.now() - 120000,
					},
					{
						outputId: "journal_1724431000000_c91e40",
						availability: "available",
						lineNumber: 16,
						rawText: '^export #format "parquet" #range "30d"',
						macroId: "@stateful-mcp/analytics:export",
						invokedAs: "export",
						status: "committed",
						result: {
							facets: {
								text: "Exported 14,250 transaction records to Parquet format.",
							},
							artifacts: [
								{
									id: "art_c91e40",
									name: "metrics_monthly.parquet",
									mimeType: "application/vnd.apache.parquet",
									sizeBytes: 2457600,
									downloadUrl: "#download-parquet",
								},
								{
									id: "art_c91e41",
									name: "summary.csv",
									mimeType: "text/csv",
									sizeBytes: 143360,
									downloadUrl: "#download-csv",
								},
							],
							gatedActions: [
								{
									actionId: "analytics.runPipeline",
									label: "Trigger Downstream ETL",
									kind: "invoke",
								},
							],
						},
						fingerprint:
							"c91e40a8f21908bc443189ef00a918471b63ef210988776655443322118f2a1b",
						executedAt: Date.now() - 360000,
					},
					{
						outputId: "journal_1724430500000_e04d12",
						availability: "available",
						lineNumber: 10,
						rawText: '^dx #term "asthma"',
						macroId: "@stateful-mcp/clinical:dx",
						invokedAs: "dx",
						status: "reversed",
						reversalReason: "Incorrect diagnostic code entered by provider",
						fingerprint:
							"e04d1278a12bc443189ef00a918471b63ef210988776655443322118f2a1bc91",
						executedAt: Date.now() - 900000,
					},
					{
						outputId: "journal_1724430000000_f55a33",
						availability: "available",
						lineNumber: 22,
						rawText: "^lab #panel cbc",
						macroId: "@stateful-mcp/lab:orders",
						invokedAs: "lab",
						status: "failed",
						errorCode: "LAB_SERVICE_TIMEOUT",
						fingerprint:
							"f55a33189ef00a918471b63ef210988776655443322118f2a1bc91e04d1278a",
						executedAt: Date.now() - 3600000,
					},
				],
			},
		},
	};

	return (
		<Card
			title="Transaction Ledger & Journal History"
			action={<Badge tone="accent">Ledger / UI</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div
					style={{
						height: 480,
						border: "1px solid var(--theme-border-subtle)",
						borderRadius: 6,
						overflow: "hidden",
						background: "var(--theme-surface-navigation)",
					}}
				>
					<JournalPaneBody
						props={{
							snapshot: mockSnapshot,
							onJumpToLine: (line) => setLastAction(`Jump to line: L${line}`),
							onCommand: (cmd, args) =>
								setLastAction(`Command: ${cmd} (${JSON.stringify(args)})`),
						}}
						helpers={
							{
								t,
							} as any
						}
					/>
				</div>
				{lastAction && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Triggered: </strong>
						<code>{lastAction}</code>
					</div>
				)}
			</div>
		</Card>
	);
}

const FIXTURE_TEMPLATES = [
	{
		templateId: "builtin:@clinical-fhir:soap_consult",
		providerId: "macro.text",
		title: "Cardiology Consult (SOAP)",
		description:
			"Comprehensive inpatient cardiology consultation with pre-seeded vitals, EKG findings, and care plan.",
		sourceExtensionId: "@stateful-mcp/clinical-fhir",
		cellDefaults: [
			{ lineNumber: 1, defaultMacroId: "@clinical/patient" },
			"@clinical/patient",
			"@clinical/vitals",
			"@clinical/ekg",
			"@clinical/plan",
		],
		requiresProfile: true,
	},
	{
		templateId: "builtin:@clinical-fhir:peds_growth",
		providerId: "macro.text",
		title: "Pediatric Milestone & Growth Check",
		description:
			"Standard pediatric well-child visit with percentiles, growth chart tags, and immunization checklist.",
		sourceExtensionId: "@stateful-mcp/clinical-fhir",
		cellDefaults: [
			{ lineNumber: 1, defaultMacroId: "@clinical/patient" },
			{ lineNumber: 2, defaultMacroId: "@clinical/growth" },
			{ lineNumber: 3, defaultMacroId: "@clinical/vaccines" },
		],
	},
	{
		templateId: "builtin:@apple-health:vitals_trend",
		providerId: "macro.text",
		title: "Apple Health Trend Analysis",
		description:
			"Syncs step counts, resting heart rate, and sleep staging directly into active clinical note.",
		sourceExtensionId: "@stateful-mcp/apple-health",
		cellDefaults: [
			{ lineNumber: 1, defaultMacroId: "@apple-health/vitals" },
			{ lineNumber: 2, defaultMacroId: "@apple-health/hr_trend" },
			{ lineNumber: 3, defaultMacroId: "@apple-health/sleep" },
		],
	},
	{
		templateId: "builtin:@financial:option_straddle",
		providerId: "macro.text",
		title: "Options Volatility Straddle Ticket",
		description:
			"Pre-computed delta-neutral straddle order with underlying price anchors and Greeks monitoring.",
		sourceExtensionId: "@stateful-mcp/financial-suite",
		cellDefaults: [
			{ lineNumber: 1, defaultMacroId: "@fin/options" },
			{ lineNumber: 2, defaultMacroId: "@fin/underlying" },
			{ lineNumber: 3, defaultMacroId: "@fin/greeks" },
		],
	},
	{
		templateId: "user:quick_triage",
		providerId: "macro.text",
		title: "Quick Triage Note",
		description: "One-click rapid intake note with acute vitals only.",
		sourceExtensionId: "@stateful-mcp/clinical-fhir",
		cellDefaults: [{ lineNumber: 1, defaultMacroId: "@clinical/vitals" }],
	},
] as const;

function TemplatePickerStory() {
	const { t } = useI18n();
	const [isOpen, setIsOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<Card
			title={t("gallery.templatePickerTitle")}
			action={<Badge tone="accent">Scaffolds</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<p
					style={{
						margin: 0,
						fontSize: 12.5,
						color: "var(--theme-content-secondary)",
					}}
				>
					Interactive modal with virtual category tree, search filtering, and
					live pinned macro palette preview.
				</p>
				<div>
					<Button
						variant="primary"
						icon={<BookTemplate size={14} />}
						onClick={() => setIsOpen(true)}
					>
						{t("templates.picker.newFromTemplate")}
					</Button>
				</div>
				{selectedId && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Instantiated Template: </strong>
						<code>{selectedId}</code>
					</div>
				)}
				<TemplatePickerModal
					isOpen={isOpen}
					onClose={() => setIsOpen(false)}
					templates={FIXTURE_TEMPLATES as any}
					onSelectTemplate={(id) => setSelectedId(id)}
				/>
			</div>
		</Card>
	);
}

function PinnedMacroBarStory() {
	const { t } = useI18n();
	const [inserted, setInserted] = useState<string | null>(null);

	return (
		<Card
			title={t("gallery.pinnedBarTitle")}
			action={<Badge tone="accent">Toolbar</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<p
					style={{
						margin: 0,
						fontSize: 12.5,
						color: "var(--theme-content-secondary)",
					}}
				>
					Pinned macro palette docked above the scratchpad canvas for 1-click
					token insertion.
				</p>
				<div
					style={{
						border: "1px solid var(--theme-border-subtle)",
						borderRadius: 6,
						overflow: "hidden",
					}}
				>
					<PinnedMacroBar
						pinnedMacroIds={[
							"@clinical/patient",
							"@clinical/vitals",
							"@clinical/ekg",
							"@clinical/plan",
						]}
						onInsertMacro={(macroId) =>
							setInserted(`^${macroId.split(":").pop() ?? macroId} `)
						}
						onOpenMacroPalette={() => setInserted("Opened Pin Palette...")}
					/>
				</div>
				{inserted && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Action Feedback: </strong>
						<code>{inserted}</code>
					</div>
				)}
			</div>
		</Card>
	);
}

function ProjectInitModalStory() {
	const { t } = useI18n();
	const [isOpen, setIsOpen] = useState(false);
	const [initReport, setInitReport] = useState<string | null>(null);

	return (
		<Card
			title={t("gallery.projectInitTitle")}
			action={<Badge tone="accent">Project Lifecycle</Badge>}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<p
					style={{
						margin: 0,
						fontSize: 12.5,
						color: "var(--theme-content-secondary)",
					}}
				>
					Guided wizard modal to initialize .macro/project.json and runtime
					storage in uninitialized directories.
				</p>
				<div>
					<Button
						variant="secondary"
						icon={<FolderPlus size={14} />}
						onClick={() => setIsOpen(true)}
					>
						{t("project.init.title")}
					</Button>
				</div>
				{initReport && (
					<div className="cell-raw-preview" style={{ padding: 8 }}>
						<strong>Initialized: </strong>
						<code>{initReport}</code>
					</div>
				)}
				<ProjectInitModal
					isOpen={isOpen}
					onClose={() => setIsOpen(false)}
					currentPath="/encounters/patient_consult_2026_08_23"
					onInitProject={async (path, name) => {
						setInitReport(`Initialized project at ${path} (name: ${name})`);
					}}
				/>
			</div>
		</Card>
	);
}
