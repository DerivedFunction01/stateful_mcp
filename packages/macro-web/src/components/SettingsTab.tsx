import type {
	SettingsOperation,
	SettingsUiItemDto,
	SettingsUiOperation,
	SettingsUiSnapshotDto,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import {
	Badge,
	Button,
	Card,
	Diagnostic,
	SelectField,
	TextInput,
	Toggle,
} from "./ui/primitives";

const SCOPE_OPTIONS = ["user", "workspace", "folder"] as const;

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
	const [busy, setBusy] = useState(false);

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
			setNotice({ severity: "error", message: errorMessage(error) });
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
					message: result.diagnostics.map((item) => item.message).join("; "),
				});
			} else if (result.status === "conflict") {
				setNotice({
					severity: "warning",
					message: t("settings.conflict"),
				});
			} else {
				setNotice({ severity: "warning", message: result.message });
			}
		} catch (error) {
			setNotice({ severity: "error", message: errorMessage(error) });
		} finally {
			setBusy(false);
		}
	};

	const setPath = (item: SettingsUiItemDto, value: unknown) => {
		if (readOnly || (item.schema.sensitive && value === "••••••••")) return;
		void applySetting({
			operation: "set",
			path: item.path,
			value,
			expectedRevision: current.settingsRevision,
		});
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
	const importInput = useRef<HTMLInputElement>(null);
	const exportSettings = async () => {
		const content = JSON.stringify(current, null, 2);
		try {
			await navigator.clipboard?.writeText(content);
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
	};
	const importSettings = async (file: File) => {
		try {
			const text = await file.text();
			const parsed = JSON.parse(text) as { rawJsonText?: unknown };
			if (!window.confirm(t("settings.importConfirm"))) return;
			await applySetting({
				operation: "replaceJson",
				rawText:
					typeof parsed.rawJsonText === "string"
						? parsed.rawJsonText
						: JSON.stringify(parsed, null, 2),
				expectedRevision: current.settingsRevision,
			});
		} catch (error) {
			setNotice({ severity: "error", message: errorMessage(error) });
		}
	};

	return (
		<div className="settings-page">
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

			<div className="settings-layout">
				<aside className="settings-sidebar">
					<label className="search-box">
						<Search size={16} />
						<input
							value={query}
							placeholder={t("settings.search")}
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
					</label>
					<div className="form-stack">
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
						<label className="field">
							<span className="field-label">{t("settings.scope")}</span>
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
					</div>
					<nav aria-label={t("settings.categories")}>
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
								<span>{section.description ?? section.category}</span>
							</button>
						))}
					</nav>
				</aside>

				<main className="settings-content">
					{selectedSection ? (
						<Card
							title={selectedSection.title}
							action={
								<Badge tone="neutral">{selectedSection.items.length}</Badge>
							}
						>
							<div className="form-stack">
								{selectedSection.groups.length > 0
									? selectedSection.groups.map((group) => (
											<div className="form-stack" key={group.id}>
												{group.title && <h3>{group.title}</h3>}
												{group.items.map((item) => (
													<SchemaField
														key={item.path.join(".")}
														item={item}
														disabled={readOnly || busy}
														onChange={(value) => setPath(item, value)}
														t={t}
													/>
												))}
											</div>
										))
									: selectedSection.items.map((item) => (
											<SchemaField
												key={item.path.join(".")}
												item={item}
												disabled={readOnly || busy}
												onChange={(value) => setPath(item, value)}
												t={t}
											/>
										))}
							</div>
						</Card>
					) : (
						<Diagnostic severity="info">{t("common.noResults")}</Diagnostic>
					)}

					{current.jsonModeAvailable ? (
						<Toggle
							label={t("settings.jsonMode")}
							checked={current.isSplitJsonMode}
							onChange={() =>
								void applyUi({ operation: "settings.ui.jsonMode.toggle" })
							}
						/>
					) : (
						<Diagnostic severity="info">
							{t("settings.jsonUnavailable")}
						</Diagnostic>
					)}
					{current.isSplitJsonMode && current.jsonModeAvailable && (
						<label className="field">
							<span className="field-label">{t("settings.rawJson")}</span>
							<textarea
								className="input"
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
					<div className="page-actions">
						<Button variant="ghost" onClick={() => void exportSettings()}>
							{t("settings.export")}
						</Button>
						<Button
							variant="ghost"
							onClick={() => importInput.current?.click()}
						>
							{t("settings.import")}
						</Button>
						<input
							ref={importInput}
							type="file"
							accept="application/json,.json"
							hidden
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void importSettings(file);
								event.currentTarget.value = "";
							}}
						/>
					</div>
				</main>
			</div>
		</div>
	);
}

function SchemaField({
	item,
	disabled,
	onChange,
	t,
}: {
	readonly item: SettingsUiItemDto;
	readonly disabled: boolean;
	readonly onChange: (value: unknown) => void;
	readonly t: (key: string, fallback?: string) => string;
}) {
	const value = item.value;
	const error = item.diagnostics.find(
		(diagnostic) => diagnostic.severity === "error",
	)?.message;
	const label = item.schema.title;
	const hint = [item.schema.description, item.origin.description]
		.filter(Boolean)
		.join(" ");
	const unsupported =
		item.schema.type === "keymap" || item.schema.widget === "custom";
	if (unsupported) {
		return (
			<Diagnostic severity="info">{`${label}: ${t("settings.unsupportedWidget")}`}</Diagnostic>
		);
	}
	if (item.schema.sensitive) {
		return (
			<TextInput
				label={label}
				value="••••••••"
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
		const options =
			item.schema.enumOptions?.map((option) => ({
				id: option.id,
				label: option.label,
			})) ??
			(item.schema.enumValues ?? []).map((option) => ({
				id: option,
				label: option,
			}));
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
						event.target.value === "" ? undefined : Number(event.target.value),
					)
				}
			/>
		);
	}
	if (
		item.schema.type === "array" ||
		item.schema.type === "object" ||
		item.schema.type === "json"
	) {
		return (
			<label className="field">
				<span className="field-label">{label}</span>
				<textarea
					className="input"
					value={JSON.stringify(
						value ?? (item.schema.type === "array" ? [] : {}),
						null,
						2,
					)}
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
