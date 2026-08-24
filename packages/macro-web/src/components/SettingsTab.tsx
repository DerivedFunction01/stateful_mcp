import type {
	SettingsBundleDto,
	SettingsBundleResult,
	SettingsDiagnosticDto,
	SettingsOperation,
	SettingsPreviewDto,
	SettingsUiItemDto,
	SettingsUiOperation,
	SettingsUiSnapshotDto,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	SETTINGS_REDACTION_MARKER,
	SETTINGS_SCOPES,
} from "@stateful-mcp/macro-protocol";
import { Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trapFocus } from "../lib/focus-trap";
import type { HostClient } from "../lib/host-client";
import { useI18n, type WebI18nKey } from "../lib/macro-i18n-provider";
import {
	Badge,
	Button,
	Card,
	Diagnostic,
	SelectField,
	TextInput,
	Toggle,
} from "./ui/primitives";

const SCOPE_OPTIONS = SETTINGS_SCOPES;

type DraftNotice =
	| {
			readonly severity: "info" | "warning" | "error";
			readonly message: string;
	  }
	| undefined;

export function SettingsTab({
	client,
	snapshot,
}: {
	readonly client: HostClient;
	readonly snapshot?: WorkspaceSnapshot;
}) {
	const { t } = useI18n();
	const hostSettings = snapshot?.settings;
	const [ui, setUi] = useState<SettingsUiSnapshotDto | undefined>(hostSettings);
	const [query, setQuery] = useState(hostSettings?.searchQuery ?? "");
	const [activeSection, setActiveSection] = useState(
		hostSettings?.sections[0]?.id ?? "",
	);
	const [jsonDraft, setJsonDraft] = useState(hostSettings?.rawJsonText ?? "{}");
	const [notice, setNotice] = useState<DraftNotice>();
	const [preview, setPreview] = useState<SettingsPreviewDto>();
	const [previewSampleInput, setPreviewSampleInput] = useState("");
	const [previewContext, setPreviewContext] = useState<{
		readonly path: readonly string[];
		readonly draftValue: unknown;
	}>();
	const [busy, setBusy] = useState(false);
	const [importMode, setImportMode] = useState<"merge" | "replace">("replace");
	const [pendingImport, setPendingImport] = useState<{
		readonly stageId: string;
		readonly revision: string;
		readonly diagnostics: readonly SettingsDiagnosticDto[];
		readonly mode: "merge" | "replace";
		readonly restore: HTMLElement | null;
	}>();
	const importDialogRef = useRef<HTMLDivElement>(null);
	const importRestoreRef = useRef<HTMLElement | null>(null);
	const importInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!hostSettings) return;
		setUi(hostSettings);
		setJsonDraft(hostSettings.rawJsonText);
		setQuery(hostSettings.searchQuery);
		if (
			!hostSettings.sections.some((section) => section.id === activeSection)
		) {
			setActiveSection(hostSettings.sections[0]?.id ?? "");
		}
	}, [hostSettings, activeSection]);

	useEffect(() => {
		if (pendingImport) queueMicrotask(() => importDialogRef.current?.focus());
	}, [pendingImport]);

	const current = ui ?? hostSettings;
	const filteredSections = useMemo(() => {
		if (!current) return [];
		const normalized = query.trim().toLowerCase();
		if (!normalized) return current.sections;
		return current.sections.filter(
			(section) =>
				[section.title, section.category, section.description]
					.filter(Boolean)
					.some((value) => value!.toLowerCase().includes(normalized)) ||
				section.items.some((item) => itemMatches(item, normalized)),
		);
	}, [current, query]);

	if (!current) {
		return (
			<div className="settings-page">
				<Diagnostic severity="warning">{t("settings.unavailable")}</Diagnostic>
			</div>
		);
	}

	const readOnly = !current.supportedScopes.includes(current.activeScope);
	const selectedSection =
		filteredSections.find((section) => section.id === activeSection) ??
		filteredSections[0];

	const applyUi = async (operation: SettingsUiOperation) => {
		try {
			const result = await client.applySettingsUi(operation);
			if (result.snapshot) setUi(result.snapshot);
			if (result.status === "unsupported") {
				setNotice({ severity: "warning", message: result.message });
			}
		} catch (error) {
			setNotice({ severity: "error", message: t("common.error") });
		}
	};

	const applySetting = async (operation: SettingsOperation) => {
		setBusy(true);
		try {
			const result = await client.applySettings(operation);
			if (result.status === "saved") {
				setUi(result.snapshot);
				setJsonDraft(result.snapshot.rawJsonText);
				setNotice(undefined);
			} else if (result.status === "blocked") {
				setUi((previous) =>
					previous ? { ...previous, ...result.snapshot } : result.snapshot,
				);
				setNotice({
					severity: "error",
					message: result.diagnostics
						.map((item: SettingsDiagnosticDto) => item.message)
						.join("; "),
				});
			} else if (result.status === "conflict") {
				setNotice({
					severity: "warning",
					message: t("settings.conflict"),
				});
			} else if (result.status === "unsupported") {
				setNotice({ severity: "warning", message: result.message });
			} else if (result.status === "preview") {
				setNotice({
					severity: result.preview.status === "invalid" ? "error" : "info",
					message: result.preview.diagnostics
						.map((diagnostic) => diagnostic.message)
						.join("; "),
				});
			}
		} catch (error) {
			setNotice({ severity: "error", message: t("common.error") });
		} finally {
			setBusy(false);
		}
	};

	const setPath = (item: SettingsUiItemDto, value: unknown) => {
		if (
			readOnly ||
			(item.schema.sensitive && value === SETTINGS_REDACTION_MARKER)
		)
			return;
		void applySetting({
			operation: "set",
			path: item.path,
			value,
			expectedRevision: current.settingsRevision,
		});
		if (
			item.path.length === 3 &&
			item.path[0] === "values" &&
			item.path[2] === "templates"
		) {
			setPreviewContext({ path: item.path, draftValue: value });
			void client
				.applySettings({
					operation: "preview",
					requestId: crypto.randomUUID(),
					path: item.path,
					draftValue: value,
					expectedRevision: current.settingsRevision,
					sampleInput: previewSampleInput || undefined,
				})
				.then((result) => {
					if (result.status === "preview") setPreview(result.preview);
				})
				.catch(() => undefined);
		}
	};

	const save = () =>
		void applySetting({
			operation: "save",
			expectedRevision: current.settingsRevision,
		});
	const reload = () =>
		void applySetting({
			operation: "reload",
			expectedRevision: current.settingsRevision,
		});
	const exportSettings = async () => {
		try {
			const result = await client.applySettingsBundle({
				operation: "export",
				scope: current.activeScope,
				profileId: current.activeProfileId,
			});
			if (result.status !== "exported") {
				setNotice({
					severity: "error",
					message: bundleResultMessage(result, t),
				});
				return;
			}
			const content = JSON.stringify(result.bundle, null, 2);
			try {
				if (!navigator.clipboard) throw new Error("Clipboard unavailable");
				await navigator.clipboard.writeText(content);
				setNotice({ severity: "info", message: t("settings.exported") });
			} catch {
				const url = URL.createObjectURL(
					new Blob([content], { type: "application/json" }),
				);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = "macro-settings.json";
				anchor.click();
				URL.revokeObjectURL(url);
				setNotice({ severity: "info", message: t("settings.downloaded") });
			}
		} catch {
			setNotice({ severity: "error", message: t("settings.conflict") });
		}
	};
	const importSettings = async (file: File) => {
		try {
			const text = await file.text();
			const parsed = JSON.parse(text) as SettingsBundleDto;
			const result = await client.applySettingsBundle({
				operation: "importStage",
				bundle: parsed,
				scope: current.activeScope,
				profileId: current.activeProfileId,
				mode: importMode,
				expectedRevision: current.settingsRevision,
			});
			if (result.status !== "staged") {
				setNotice({
					severity: "error",
					message: bundleResultMessage(result, t),
				});
				return;
			}
			importRestoreRef.current = document.activeElement as HTMLElement | null;
			setPendingImport({
				stageId: result.stageId,
				revision: result.revision,
				diagnostics: result.diagnostics,
				mode: importMode,
				restore: importRestoreRef.current,
			});
		} catch (error) {
			setNotice({ severity: "error", message: t("common.error") });
		}
	};
	const cancelImport = () => {
		const restore = pendingImport?.restore;
		setPendingImport(undefined);
		queueMicrotask(() => restore?.focus());
	};
	const applyImport = async () => {
		if (!pendingImport) return;
		setBusy(true);
		try {
			const result = await client.applySettingsBundle({
				operation: "importApply",
				stageId: pendingImport.stageId,
				mode: pendingImport.mode,
				expectedRevision: pendingImport.revision,
			});
			if (result.status === "applied") {
				setUi(result.snapshot);
				setJsonDraft(result.snapshot.rawJsonText);
				setNotice({ severity: "info", message: t("settings.imported") });
				const restore = pendingImport.restore;
				setPendingImport(undefined);
				queueMicrotask(() => restore?.focus());
			} else {
				setNotice({
					severity: "error",
					message: bundleResultMessage(result, t),
				});
			}
		} catch (error) {
			setNotice({ severity: "error", message: t("common.error") });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="settings-page">
			{pendingImport && (
				<div className="modal-overlay" role="presentation">
					<div
						ref={importDialogRef}
						className="modal-card"
						role="dialog"
						aria-modal="true"
						aria-labelledby="settings-import-title"
						tabIndex={-1}
						onKeyDown={(event) => {
							trapFocus(event, importDialogRef.current);
							if (event.key === "Escape") {
								event.preventDefault();
								cancelImport();
							}
						}}
					>
						<h2 id="settings-import-title">{t("settings.importConfirm")}</h2>
						{pendingImport.diagnostics.length > 0 ? (
							<ul>
								{pendingImport.diagnostics.map((diagnostic, index) => (
									<li key={`${diagnostic.message}-${index}`}>
										{diagnostic.path ? `${diagnostic.path.join(".")}: ` : ""}
										{diagnostic.message}
									</li>
								))}
							</ul>
						) : (
							<p>{t("settings.importReady")}</p>
						)}
						<label className="field-label" htmlFor="settings-import-mode">
							{t("settings.importMode")}
						</label>
						<select
							id="settings-import-mode"
							className="input select"
							value={importMode}
							onChange={(event) => {
								const mode = event.target.value as "merge" | "replace";
								setImportMode(mode);
								setPendingImport((previous) =>
									previous ? { ...previous, mode } : previous,
								);
							}}
						>
							<option value="replace">{t("settings.importReplace")}</option>
							<option value="merge">{t("settings.importMerge")}</option>
						</select>
						<div className="page-actions">
							<Button variant="ghost" onClick={cancelImport}>
								{t("settings.cancel")}
							</Button>
							<Button variant="primary" onClick={() => void applyImport()}>
								{t("settings.import")}
							</Button>
						</div>
					</div>
				</div>
			)}
			<header className="page-header">
				<div>
					<span className="eyebrow">{t("settings.profileLabel")}</span>
					<h1>
						<Settings2 size={25} />
						{t("settings.title")}
					</h1>
					<p>{t("settings.description")}</p>
				</div>
				<div className="page-actions">
					<Button variant="ghost" disabled={busy} onClick={reload}>
						{t("settings.discard")}
					</Button>
					<Button
						variant="primary"
						disabled={busy || !hasModified(current)}
						onClick={save}
					>
						{t("settings.actions.save")}
					</Button>
				</div>
			</header>

			{readOnly && (
				<Diagnostic severity="warning">
					{t("settings.scope.unsupported")}
				</Diagnostic>
			)}
			{notice && (
				<Diagnostic severity={notice.severity}>{notice.message}</Diagnostic>
			)}

			<div className="settings-toolbar">
				<div className="settings-toolbar-left">
					<label className="search-box">
						<Search size={16} />
						<input
							value={query}
							placeholder={t("settings.searchPlaceholder")}
							aria-label={t("settings.search")}
							onChange={(event) => {
								const value = event.target.value;
								setQuery(value);
								void applyUi({
									operation: "settings.ui.search.set",
									query: value,
								});
							}}
						/>
						{query && (
							<button
								type="button"
								className="settings-reset-button"
								onClick={() => {
									setQuery("");
									void applyUi({
										operation: "settings.ui.search.set",
										query: "",
									});
								}}
							>
								×
							</button>
						)}
					</label>
				</div>
				<div className="settings-toolbar-right">
					<label className="field" style={{ width: "auto", minWidth: 140 }}>
						<select
							className="input select"
							value={current.activeScope}
							onChange={(event) => {
								const scope = event.target
									.value as (typeof SCOPE_OPTIONS)[number];
								if (!current.supportedScopes.includes(scope)) return;
								void applyUi({ operation: "settings.ui.scope.set", scope });
							}}
						>
							{SCOPE_OPTIONS.map((scope) => (
								<option
									key={scope}
									value={scope}
									disabled={!current.supportedScopes.includes(scope)}
								>
									{scope === "workspace"
										? t("settings.scope.workspace")
										: scope === "user"
											? t("settings.scope.user")
											: t("settings.scope.folder")}
								</option>
							))}
						</select>
					</label>
					<Toggle
						label={t("settings.modifiedOnly")}
						checked={current.filterModifiedOnly}
						onChange={(enabled) =>
							void applyUi({
								operation: "settings.ui.modifiedOnly.set",
								enabled,
							})
						}
					/>
					<Button variant="ghost" onClick={() => void exportSettings()}>
						{t("settings.export")}
					</Button>
					<Button variant="ghost" onClick={() => importInput.current?.click()}>
						{t("settings.import")}
					</Button>
					<input
						ref={importInput}
						type="file"
						accept=".json,application/json"
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void importSettings(file);
							event.target.value = "";
						}}
					/>
				</div>
			</div>

			<div className="settings-layout">
				<aside className="settings-sidebar">
					<SelectField
						label={t("settings.profile")}
						value={current.activeProfileId}
						options={current.availableProfiles.map((id) => ({
							id,
							label: id,
						}))}
						onChange={(profileId) =>
							void applySetting({
								operation: "profile.select",
								profileId,
								expectedRevision: current.settingsRevision,
							})
						}
					/>

					<nav
						className="settings-sidebar-nav"
						aria-label={t("settings.categories")}
					>
						{filteredSections.map((section) => (
							<button
								type="button"
								key={section.id}
								className={
									activeSection === section.id
										? "settings-nav-item active"
										: "settings-nav-item"
								}
								onClick={() => {
									setActiveSection(section.id);
									void applyUi({
										operation: "settings.ui.section.set",
										sectionId: section.id,
									});
								}}
							>
								<strong>{section.title}</strong>
								<Badge
									tone={activeSection === section.id ? "accent" : "neutral"}
								>
									{section.items.length}
								</Badge>
							</button>
						))}
					</nav>
				</aside>

				<main className="settings-content">
					{selectedSection ? (
						<div className="form-stack">
							{selectedSection.groups.length > 0 ? (
								selectedSection.groups.map((group) => (
									<div className="settings-group-section" key={group.id}>
										{group.title && (
											<h3 className="settings-group-title">{group.title}</h3>
										)}
										<div className="form-stack">
											{group.items.map((item) => (
												<SchemaField
													key={item.path.join(".")}
													item={item}
													disabled={readOnly || busy}
													onChange={(value) => setPath(item, value)}
													onReset={() => setPath(item, item.effectiveValue)}
													t={t}
												/>
											))}
										</div>
									</div>
								))
							) : (
								<div className="settings-group-section">
									<div className="form-stack">
										{selectedSection.items.map((item) => (
											<SchemaField
												key={item.path.join(".")}
												item={item}
												disabled={readOnly || busy}
												onChange={(value) => setPath(item, value)}
												onReset={() => setPath(item, item.effectiveValue)}
												t={t}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						<Diagnostic severity="info">{t("common.noResults")}</Diagnostic>
					)}

					{preview && (
						<SettingsPreviewPanel
							preview={preview}
							t={t}
							sampleInput={previewSampleInput}
							onSampleInputChange={(sampleInput) => {
								setPreviewSampleInput(sampleInput);
								if (!previewContext) return;
								void client
									.applySettings({
										operation: "preview",
										requestId: crypto.randomUUID(),
										path: previewContext.path,
										draftValue: previewContext.draftValue,
										sampleInput: sampleInput || undefined,
										expectedRevision: current.settingsRevision,
									})
									.then((result) => {
										if (result.status === "preview") setPreview(result.preview);
									})
									.catch(() => undefined);
							}}
						/>
					)}

					{current.jsonModeAvailable && (
						<div className="settings-group-section">
							<Toggle
								label={t("settings.jsonMode")}
								checked={current.isSplitJsonMode}
								onChange={() =>
									void applyUi({ operation: "settings.ui.jsonMode.toggle" })
								}
							/>
							{current.isSplitJsonMode && (
								<label className="field">
									<span className="field-label">{t("settings.rawJson")}</span>
									<textarea
										className="input"
										rows={10}
										value={jsonDraft}
										disabled={readOnly || busy}
										onChange={(event) => setJsonDraft(event.target.value)}
										onBlur={() =>
											void applySetting({
												operation: "replaceJson",
												rawText: jsonDraft,
												expectedRevision: current.settingsRevision,
											})
										}
									/>
								</label>
							)}
						</div>
					)}
				</main>
			</div>
		</div>
	);
}

function SchemaField({
	item,
	disabled,
	onChange,
	onReset,
	t,
}: {
	readonly item: SettingsUiItemDto;
	readonly disabled: boolean;
	readonly onChange: (value: unknown) => void;
	readonly onReset?: () => void;
	readonly t: (key: WebI18nKey) => string;
}) {
	const value = item.value;
	const error = item.diagnostics.find(
		(diagnostic) => diagnostic.severity === "error",
	)?.message;
	const label = item.schema.title;
	const hint = [item.schema.description, item.origin.description]
		.filter(Boolean)
		.join(" ");

	const renderInput = () => {
		if (item.schema.type === "keymap" || item.schema.widget === "keymap") {
			return (
				<KeymapTableField
					label={label}
					bindings={Array.isArray(value) ? value : []}
					disabled={disabled}
					hint={hint}
					error={error}
					onChange={onChange}
				/>
			);
		}
		if (item.schema.widget === "tag-input" || item.schema.type === "array") {
			const delimiters =
				item.schema.type === "array" || item.schema.type === "string"
					? item.schema.tagDelimiters
					: undefined;
			return (
				<TagInputField
					label={label}
					tags={Array.isArray(value) ? value.map(String) : []}
					delimiters={delimiters}
					disabled={disabled}
					hint={hint}
					error={error}
					onChange={onChange}
				/>
			);
		}
		if (item.schema.sensitive) {
			return (
				<TextInput
					label={label}
					value={SETTINGS_REDACTION_MARKER}
					disabled={disabled}
					hint={hint}
					error={error}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
		}
		if (item.schema.type === "boolean") {
			return (
				<Toggle
					label={label}
					checked={Boolean(value)}
					onChange={onChange as (checked: boolean) => void}
				/>
			);
		}
		if (item.schema.type === "enum") {
			const options: readonly { id: string; label: string }[] =
				item.schema.enumOptions?.map((option) => ({
					id: option.id,
					label: option.label,
				})) ?? [];
			return (
				<SelectField
					label={label}
					value={String(value ?? "")}
					options={options}
					onChange={onChange}
				/>
			);
		}
		if (item.schema.type === "number") {
			return (
				<TextInput
					label={label}
					type="number"
					value={value == null ? "" : String(value)}
					min={item.schema.min}
					max={item.schema.max}
					step={item.schema.step}
					disabled={disabled}
					hint={hint}
					error={error}
					onChange={(event) =>
						onChange(
							event.target.value === ""
								? undefined
								: Number(event.target.value),
						)
					}
				/>
			);
		}
		if (item.schema.type === "object" || item.schema.type === "json") {
			return (
				<label className="field">
					<span className="field-label">{label}</span>
					<textarea
						className="input"
						value={JSON.stringify(value ?? {}, null, 2)}
						disabled={disabled}
						aria-invalid={Boolean(error)}
						onChange={(event) => {
							try {
								onChange(JSON.parse(event.target.value));
							} catch {
								/* validation remains host-owned */
							}
						}}
					/>
					<span className="field-hint">{hint}</span>
					{error && <span className="field-error">{error}</span>}
				</label>
			);
		}
		return (
			<TextInput
				label={label}
				value={value == null ? "" : String(value)}
				disabled={disabled}
				placeholder={item.schema.placeholder}
				hint={hint}
				error={error}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	};

	return (
		<div className="settings-field-row">
			<div className="settings-field-header">
				<span className="settings-path-breadcrumb">
					{item.path.join(" › ")}
				</span>
				<div className="settings-field-meta">
					<Badge tone={item.isModified ? "accent" : "neutral"}>
						{item.origin.description}
					</Badge>
					{item.isModified && onReset && (
						<button
							type="button"
							className="settings-reset-button"
							title="Reset setting"
							disabled={disabled}
							onClick={onReset}
						>
							↺
						</button>
					)}
				</div>
			</div>
			{renderInput()}
		</div>
	);
}

function TagInputField({
	label,
	tags,
	hint,
	error,
	disabled,
	delimiters,
	onChange,
}: {
	readonly label: string;
	readonly tags: readonly string[];
	readonly hint?: string;
	readonly error?: string;
	readonly disabled?: boolean;
	readonly delimiters?: readonly string[];
	readonly onChange: (tags: readonly string[]) => void;
}) {
	const [input, setInput] = useState("");
	const delims = delimiters ?? [",", " "];

	const addTag = (text: string) => {
		const trimmed = text.trim();
		if (trimmed && !tags.includes(trimmed)) {
			onChange([...tags, trimmed]);
		}
		setInput("");
	};

	const removeTag = (index: number) => {
		onChange(tags.filter((_, i) => i !== index));
	};

	return (
		<div className="field">
			<span className="field-label">{label}</span>
			<div className="settings-tag-container">
				{tags.map((tag, idx) => (
					<span key={`${tag}-${idx}`} className="settings-tag-pill">
						{tag}
						{!disabled && (
							<button
								type="button"
								className="settings-tag-remove"
								onClick={() => removeTag(idx)}
							>
								×
							</button>
						)}
					</span>
				))}
				<input
					className="settings-tag-input"
					type="text"
					value={input}
					disabled={disabled}
					placeholder={tags.length === 0 ? "Type and press Enter..." : ""}
					onChange={(e) => {
						const val = e.target.value;
						if (delims.some((d) => val.includes(d))) {
							const parts = val.split(
								new RegExp(`[${delims.map((d) => `\\${d}`).join("")}]`),
							);
							for (const part of parts) {
								if (part.trim()) addTag(part);
							}
						} else {
							setInput(val);
						}
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addTag(input);
						} else if (e.key === "Backspace" && !input && tags.length > 0) {
							removeTag(tags.length - 1);
						}
					}}
				/>
			</div>
			{hint && <span className="field-hint">{hint}</span>}
			{error && <span className="field-error">{error}</span>}
		</div>
	);
}

interface KeybindingRow {
	chord: string;
	command: string;
}

function KeymapTableField({
	label,
	bindings,
	hint,
	error,
	disabled,
	onChange,
}: {
	readonly label: string;
	readonly bindings: readonly unknown[];
	readonly hint?: string;
	readonly error?: string;
	readonly disabled?: boolean;
	readonly onChange: (bindings: readonly unknown[]) => void;
}) {
	const { t } = useI18n();
	const [newChord, setNewChord] = useState("");
	const [newCommand, setNewCommand] = useState("");

	const typedBindings = (
		Array.isArray(bindings) ? bindings : []
	) as KeybindingRow[];

	const addBinding = () => {
		if (newChord.trim() && newCommand.trim()) {
			onChange([
				...typedBindings,
				{ chord: newChord.trim(), command: newCommand.trim() },
			]);
			setNewChord("");
			setNewCommand("");
		}
	};

	const removeBinding = (index: number) => {
		onChange(typedBindings.filter((_, i) => i !== index));
	};

	return (
		<div className="field">
			<span className="field-label">{label}</span>
			<div className="settings-keymap-table-wrapper">
				<table className="settings-keymap-table">
					<thead>
						<tr>
							<th>{t("project.settings.keymapCommand")}</th>
							<th>{t("project.settings.keymapChord")}</th>
							{!disabled && <th>{t("project.settings.actions")}</th>}
						</tr>
					</thead>
					<tbody>
						{typedBindings.map((b, idx) => (
							<tr key={`${b.command}-${idx}`}>
								<td>
									<code>{b.command}</code>
								</td>
								<td>
									<kbd className="settings-chord-badge">{b.chord}</kbd>
								</td>
								{!disabled && (
									<td>
										<Button variant="ghost" onClick={() => removeBinding(idx)}>
											{t("project.settings.delete")}
										</Button>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
				{!disabled && (
					<div className="settings-keymap-add-row">
						<input
							className="input"
							type="text"
							placeholder={t("project.settings.keymapCommandPlaceholder")}
							value={newCommand}
							onChange={(e) => setNewCommand(e.target.value)}
						/>
						<input
							className="input"
							type="text"
							placeholder={t("project.settings.keymapChordPlaceholder")}
							value={newChord}
							onChange={(e) => setNewChord(e.target.value)}
						/>
						<Button variant="primary" onClick={addBinding}>
							{t("project.settings.add")}
						</Button>
					</div>
				)}
			</div>
			{hint && <span className="field-hint">{hint}</span>}
			{error && <span className="field-error">{error}</span>}
		</div>
	);
}

function SettingsPreviewPanel({
	preview,
	sampleInput,
	onSampleInputChange,
	t,
}: {
	readonly preview: SettingsPreviewDto;
	readonly sampleInput: string;
	readonly onSampleInputChange: (value: string) => void;
	readonly t: (key: WebI18nKey) => string;
}) {
	return (
		<Card title={t("settings.preview")}>
			<div className="form-stack">
				<TextInput
					label={t("settings.preview.sampleInput")}
					value={sampleInput}
					onChange={(event) => onSampleInputChange(event.target.value)}
				/>
				{preview.tokenDescriptors && preview.tokenDescriptors.length > 0 && (
					<div>
						<strong>{t("settings.preview.tokens")}</strong>
						<ul>
							{preview.tokenDescriptors.map((token) => (
								<li key={token.id}>{t(token.labelKey as WebI18nKey)}</li>
							))}
						</ul>
					</div>
				)}
				{preview.templateAnalysis?.map((analysis) => (
					<div key={analysis.template}>
						<strong>{analysis.template}</strong>
						<div>
							{analysis.segments.map((segment) => (
								<span
									key={`${segment.start}-${segment.end}`}
									className={`settings-preview-segment ${segment.kind}`}
								>
									{segment.text}
								</span>
							))}
						</div>
						{analysis.unknownTokens.length > 0 && (
							<Diagnostic severity="warning">
								{t("settings.preview.unknownTokens")}
							</Diagnostic>
						)}
					</div>
				))}
				{preview.sample && (
					<Diagnostic severity={preview.sample.matched ? "info" : "warning"}>
						{preview.sample.matched
							? t("settings.preview.sampleMatched")
							: t("settings.preview.sampleFailed")}
					</Diagnostic>
				)}
				{preview.diagnostics.map((diagnostic, index) => (
					<Diagnostic
						key={`${diagnostic.code}-${index}`}
						severity={diagnostic.severity}
					>
						{previewDiagnosticMessage(diagnostic, t)}
					</Diagnostic>
				))}
			</div>
		</Card>
	);
}

function previewDiagnosticMessage(
	diagnostic: SettingsDiagnosticDto,
	t: (key: WebI18nKey) => string,
): string {
	if (diagnostic.code === "UNKNOWN_TEMPLATE_TOKEN")
		return t("settings.preview.unknownTokens");
	if (diagnostic.code === "SETTINGS_PREVIEW_STALE")
		return t("settings.preview.stale");
	return t("settings.preview.diagnostic");
}

function itemMatches(item: SettingsUiItemDto, query: string): boolean {
	return [
		item.schema.title,
		item.schema.description,
		item.path.join("."),
		item.origin.description,
	]
		.filter(Boolean)
		.some((value) => value!.toLowerCase().includes(query));
}

function hasModified(snapshot: SettingsUiSnapshotDto): boolean {
	return snapshot.modifiedCount > 0 || snapshot.totalModifiedCount > 0;
}

function bundleResultMessage(
	result: SettingsBundleResult,
	t: (
		key: WebI18nKey,
		params?: Readonly<Record<string, string | number>>,
	) => string,
): string {
	if (result.status === "unsupported") {
		if (result.code === "SETTINGS_SCOPE_UNSUPPORTED")
			return t("settings.scope.unsupported");
		if (result.code === "SETTINGS_PROFILE_UNSUPPORTED")
			return t("settings.profile.unsupported");
		return t("common.error");
	}
	if (result.status === "invalid") return t("settings.bundle.invalid");
	if (result.status === "stale") return t("settings.conflict");
	if (result.status === "blocked")
		return t("settings.bundle.blocked", {
			message: result.diagnostics
				.map((diagnostic) => diagnostic.message)
				.join("; "),
		});
	return t("settings.imported");
}
