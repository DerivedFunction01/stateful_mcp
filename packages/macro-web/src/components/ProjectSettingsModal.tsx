import type {
	ProjectConfigurationDto,
	ProjectMigrationJournalStatusDto,
	ProjectMigrationRecoveryResultDto,
	ProjectOperationResult,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import { Copy, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import {
	Badge,
	Button,
	Diagnostic,
	IconButton,
	TextInput,
} from "./ui/primitives";

function jsonText(value: unknown): string {
	return JSON.stringify(value ?? [], null, 2);
}

function sanitizeProfileId(raw: string): string {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return cleaned;
}

export function ProjectSettingsModal({
	isOpen,
	client,
	onClose,
	onUpdated,
	onManageTemplates,
}: {
	readonly isOpen: boolean;
	readonly client: HostClient;
	readonly onClose: () => void;
	readonly onUpdated?: (result: ProjectOperationResult) => void;
	readonly onManageTemplates?: () => void;
}) {
	const { t, availableLocales } = useI18n();
	const [configuration, setConfiguration] = useState<ProjectConfigurationDto>();
	const [draft, setDraft] = useState<ProjectConfigurationDto>();
	const [activeExtensionProfileId, setActiveExtensionProfileId] = useState("");
	const [projectSettings, setProjectSettings] = useState<
		ProjectConfigurationDto["projectSettings"]
	>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [targetBackend, setTargetBackend] = useState<"jsonl" | "sqlite">(
		"jsonl",
	);
	const [migrationPlan, setMigrationPlan] = useState<ProjectOperationResult>();
	const [migrationJournal, setMigrationJournal] =
		useState<ProjectMigrationJournalStatusDto | null>(null);
	const [journalBusy, setJournalBusy] = useState(false);
	const [journalResult, setJournalResult] =
		useState<ProjectMigrationRecoveryResultDto | null>(null);
	const [creatingProfile, setCreatingProfile] = useState(false);
	const [newProfileName, setNewProfileName] = useState("");
	const [renamingProfileId, setRenamingProfileId] = useState<string | null>(
		null,
	);
	const [renameValue, setRenameValue] = useState("");

	useEffect(() => {
		if (!isOpen) return;
		if (!client.getProjectConfiguration) {
			setError(t("project.settings.unavailable"));
			return;
		}
		setConfiguration(undefined);
		setDraft(undefined);
		setError(undefined);
		setCreatingProfile(false);
		setNewProfileName("");
		setRenamingProfileId(null);
		setMigrationJournal(null);
		setJournalResult(null);
		void client
			.getProjectConfiguration()
			.then((value) => {
				setConfiguration(value);
				setDraft(value);
				setActiveExtensionProfileId(value.activeExtensionProfileId ?? "");
				setProjectSettings(value.projectSettings ?? {});
				setTargetBackend(value.backend.kind);
				if (client.getMigrationJournal) void refreshJournal();
			})
			.catch((reason: unknown) =>
				setError(reason instanceof Error ? reason.message : String(reason)),
			);
	}, [client, isOpen, t]);

	// Keep every hook above the closed-modal early return. The modal remains
	// mounted while closed, so conditional hook execution would change the hook
	// order when project data is loaded/opened.
	const extensionsById = useMemo(
		() =>
			new Map(
				(draft?.extensions ?? []).map((extension) => [extension.id, extension]),
			),
		[draft?.extensions],
	);

	if (!isOpen) return null;

	const update = (change: Partial<ProjectConfigurationDto>) =>
		setDraft((value) => (value ? { ...value, ...change } : value));
	const profileIds = draft ? Object.keys(draft.extensionProfiles ?? {}) : [];
	const resolvedLocale = Intl.DateTimeFormat().resolvedOptions().locale;
	const localeIds = availableLocales.map((locale) => locale.id);
	const localeDisplayNames = new Intl.DisplayNames([resolvedLocale], {
		type: "language",
	});

	const save = async () => {
		if (!draft || !configuration || !client.updateProjectConfiguration) return;
		setBusy(true);
		setError(undefined);
		try {
			const result = await client.updateProjectConfiguration(
				{
					...draft,
					activeExtensionProfileId: activeExtensionProfileId || undefined,
					projectSettings,
				},
				configuration.revision,
			);
			if (result.status === "accepted") {
				setConfiguration(result.configuration);
				setDraft(result.configuration);
				onUpdated?.(result);
				onClose();
			} else {
				setError(
					"message" in result
						? result.message
						: t("project.settings.migrationUnavailable"),
				);
			}
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};
	const previewMigration = async () => {
		if (!draft || !client.previewBackendMigration) return;
		setBusy(true);
		setError(undefined);
		try {
			const result = await client.previewBackendMigration({
				kind: targetBackend,
				path:
					targetBackend === "jsonl"
						? ".macro/state.jsonl"
						: ".macro/state.sqlite",
			});
			if (result.status === "plan") setMigrationPlan(result);
			else
				setError(
					"message" in result
						? result.message
						: t("project.settings.migrationUnavailable"),
				);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};
	const applyMigration = async () => {
		if (!configuration || !client.applyBackendMigration) return;
		setBusy(true);
		setError(undefined);
		try {
			const result = await client.applyBackendMigration(
				{
					kind: targetBackend,
					path:
						targetBackend === "jsonl"
							? ".macro/state.jsonl"
							: ".macro/state.sqlite",
				},
				configuration.revision,
			);
			if (result.status === "migrated") {
				onUpdated?.(result);
				// Resync after migration so the draft reflects the new backend.
				if (client.getProjectConfiguration) {
					const refreshed = await client.getProjectConfiguration();
					setConfiguration(refreshed);
					setDraft(refreshed);
					setActiveExtensionProfileId(refreshed.activeExtensionProfileId ?? "");
					setProjectSettings(refreshed.projectSettings ?? {});
					setTargetBackend(refreshed.backend.kind);
				}
				onClose();
			} else
				setError(
					"message" in result
						? result.message
						: t("project.settings.migrationUnavailable"),
				);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};

	const refreshJournal = async () => {
		if (!client.getMigrationJournal) return;
		setJournalBusy(true);
		setJournalResult(null);
		try {
			const journal = await client.getMigrationJournal();
			setMigrationJournal(journal.journal ? journal : null);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setJournalBusy(false);
		}
	};

	const recoverMigration = async () => {
		if (!client.recoverBackendMigration) return;
		setJournalBusy(true);
		setError(undefined);
		try {
			const result = await client.recoverBackendMigration();
			setJournalResult(result);
			await refreshJournal();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setJournalBusy(false);
		}
	};

	const discardMigration = async () => {
		if (!client.discardBackendMigration) return;
		setJournalBusy(true);
		setError(undefined);
		try {
			const result = await client.discardBackendMigration();
			setJournalResult(result);
			await refreshJournal();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setJournalBusy(false);
		}
	};

	const resumeMigration = async () => {
		if (!client.resumeBackendMigration) return;
		setJournalBusy(true);
		setError(undefined);
		try {
			const result = await client.resumeBackendMigration();
			if ("message" in result) {
				setError(result.message);
				return;
			}
			if (result.status !== "migrated") {
				setError(t("project.settings.migrationUnavailable"));
				return;
			}
			setJournalResult({ action: "targetDiscarded", journal: null });
			if (client.getProjectConfiguration) {
				const refreshed = await client.getProjectConfiguration();
				setConfiguration(refreshed);
				setDraft(refreshed);
				setActiveExtensionProfileId(refreshed.activeExtensionProfileId ?? "");
				setProjectSettings(refreshed.projectSettings ?? {});
				setTargetBackend(refreshed.backend.kind);
			}
			onUpdated?.(result);
			onClose();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setJournalBusy(false);
		}
	};

	// ---- Activation group (extension profile) CRUD --------------------------

	const commitCreateProfile = () => {
		if (!draft) return;
		const existing = draft.extensionProfiles ?? {};
		const id =
			sanitizeProfileId(newProfileName) || `group-${profileIds.length + 1}`;
		if (id in existing) {
			setError(t("project.settings.duplicateGroupName", { name: id }));
			return;
		}
		update({ extensionProfiles: { ...existing, [id]: [] } });
		setActiveExtensionProfileId(id);
		setCreatingProfile(false);
		setNewProfileName("");
		setError(undefined);
	};

	const commitRenameProfile = (oldId: string) => {
		if (!draft) return;
		const existing = draft.extensionProfiles ?? {};
		const id = sanitizeProfileId(renameValue) || oldId;
		if (id !== oldId) {
			if (id in existing) {
				setError(t("project.settings.duplicateGroupName", { name: id }));
				return;
			}
			const next = { ...existing, [id]: existing[oldId] ?? [] };
			delete next[oldId];
			update({ extensionProfiles: next });
			if (activeExtensionProfileId === oldId) setActiveExtensionProfileId(id);
		}
		setRenamingProfileId(null);
		setError(undefined);
	};

	const duplicateProfile = (sourceId: string) => {
		if (!draft) return;
		const existing = draft.extensionProfiles ?? {};
		let id = `${sourceId}-copy`;
		let n = 1;
		while (id in existing) id = `${sourceId}-copy-${++n}`;
		update({
			extensionProfiles: { ...existing, [id]: existing[sourceId] ?? [] },
		});
		setActiveExtensionProfileId(id);
	};

	const deleteProfile = (id: string) => {
		if (!draft) return;
		if (!window.confirm(t("project.settings.confirmDeleteGroup", { name: id })))
			return;
		const existing = draft.extensionProfiles ?? {};
		const next = { ...existing };
		delete next[id];
		update({ extensionProfiles: next });
		if (activeExtensionProfileId === id) setActiveExtensionProfileId("");
	};

	// ---- Dependency-aware membership editing --------------------------------

	const activeMembers = activeExtensionProfileId
		? (draft?.extensionProfiles?.[activeExtensionProfileId] ?? [])
		: [];

	const setMembers = (profileId: string, ids: readonly string[]) => {
		if (!draft) return;
		update({
			extensionProfiles: {
				...(draft.extensionProfiles ?? {}),
				[profileId]: ids,
			},
		});
	};

	const toggleExtension = (extensionId: string, checked: boolean) => {
		if (!activeExtensionProfileId) return;
		const current = new Set(activeMembers);
		if (checked) {
			current.add(extensionId);
			const queue = [extensionId];
			while (queue.length) {
				const id = queue.shift() as string;
				for (const dependency of extensionsById.get(id)?.requires ?? []) {
					if (!current.has(dependency)) {
						current.add(dependency);
						queue.push(dependency);
					}
				}
			}
		} else {
			current.delete(extensionId);
		}
		setMembers(activeExtensionProfileId, [...current]);
	};

	const isLocked = (extensionId: string): boolean => {
		if (!activeExtensionProfileId) return false;
		return (draft?.extensions ?? [])
			.filter((extension) => extension.requires?.includes(extensionId))
			.some((extension) => activeMembers.includes(extension.id));
	};

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div
				className="modal-dialog project-settings-dialog"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="project-settings-title"
			>
				<header className="modal-header">
					<div className="modal-title-row">
						<Settings2 size={18} className="modal-icon" />
						<h2 id="project-settings-title" className="modal-title">
							{t("project.settings.title")}
						</h2>
					</div>
					<button
						type="button"
						className="modal-close-btn"
						onClick={onClose}
						aria-label={t("workbench.close")}
					>
						<X size={16} />
					</button>
				</header>
				{draft ? (
					<div className="project-settings-form">
						<TextInput
							label={t("project.settings.displayName")}
							value={draft.displayName}
							onChange={(event) => update({ displayName: event.target.value })}
						/>
						<TextInput
							label={t("project.settings.projectId")}
							value={draft.projectId}
							readOnly
						/>
						<SelectField
							label={t("project.settings.locale")}
							value={draft.uiLocale ?? ""}
							onChange={(value) => update({ uiLocale: value || undefined })}
							options={localeIds.map((value) => ({
								value,
								label: localeDisplayNames.of(value) ?? value,
							}))}
						/>
						<SelectField
							label={t("project.settings.activeExtensionProfile")}
							value={activeExtensionProfileId}
							onChange={setActiveExtensionProfileId}
							options={profileIds.map((value) => ({ value, label: value }))}
							emptyLabel={t("project.settings.noProfile")}
						/>

						<section className="project-settings-section">
							<div className="project-settings-section-heading">
								<h3>{t("project.settings.extensionProfiles")}</h3>
								<Button
									variant="ghost"
									icon={<Plus size={14} />}
									onClick={() => {
										setCreatingProfile(true);
										setNewProfileName("");
									}}
								>
									{t("project.settings.createGroup")}
								</Button>
							</div>
							{creatingProfile && (
								<div className="project-settings-profile-create">
									<TextInput
										label={t("project.settings.groupName")}
										value={newProfileName}
										placeholder={t("project.settings.groupNamePlaceholder")}
										onChange={(event) => setNewProfileName(event.target.value)}
										autoFocus
									/>
									<div className="project-settings-profile-actions">
										<Button
											variant="primary"
											onClick={() => commitCreateProfile()}
										>
											{t("project.settings.add")}
										</Button>
										<Button
											variant="ghost"
											onClick={() => setCreatingProfile(false)}
										>
											{t("project.settings.cancel")}
										</Button>
									</div>
								</div>
							)}
							{profileIds.length === 0 && !creatingProfile && (
								<span className="project-settings-hint">
									{t("project.settings.noGroups")}
								</span>
							)}
							{profileIds.map((profileId) => {
								const isActive = profileId === activeExtensionProfileId;
								const memberCount =
									draft.extensionProfiles?.[profileId]?.length ?? 0;
								return (
									<div
										className={
											isActive
												? "project-settings-profile-row active"
												: "project-settings-profile-row"
										}
										key={profileId}
									>
										<button
											type="button"
											className="project-settings-profile-select"
											onClick={() => setActiveExtensionProfileId(profileId)}
											aria-pressed={isActive}
										>
											{renamingProfileId === profileId ? (
												<TextInput
													label=""
													value={renameValue}
													onChange={(event) =>
														setRenameValue(event.target.value)
													}
													autoFocus
													onKeyDown={(event) => {
														if (event.key === "Enter")
															commitRenameProfile(profileId);
														if (event.key === "Escape")
															setRenamingProfileId(null);
													}}
												/>
											) : (
												<>
													<strong>{profileId}</strong>
													<small>
														{t("project.settings.memberCount", {
															count: memberCount,
														})}
													</small>
												</>
											)}
										</button>
										<div className="project-settings-profile-actions">
											{renamingProfileId === profileId ? (
												<Button
													variant="primary"
													onClick={() => commitRenameProfile(profileId)}
												>
													{t("project.settings.renameGroup")}
												</Button>
											) : (
												<IconButton
													label={t("project.settings.renameGroup")}
													onClick={() => {
														setRenamingProfileId(profileId);
														setRenameValue(profileId);
													}}
												>
													<Pencil size={14} />
												</IconButton>
											)}
											<IconButton
												label={t("project.settings.duplicateGroup")}
												onClick={() => duplicateProfile(profileId)}
											>
												<Copy size={14} />
											</IconButton>
											<IconButton
												label={t("project.settings.deleteGroup")}
												onClick={() => deleteProfile(profileId)}
											>
												<Trash2 size={14} />
											</IconButton>
										</div>
									</div>
								);
							})}
						</section>

						<section className="project-settings-section">
							<h3>{t("project.settings.extensions")}</h3>
							{!activeExtensionProfileId && (
								<span className="project-settings-hint">
									{t("project.settings.membershipHint")}
								</span>
							)}
							{(draft.extensions ?? []).map((extension) => {
								const enabled = activeMembers.includes(extension.id);
								const locked = isLocked(extension.id);
								return (
									<label
										className={
											locked
												? "project-settings-extension-row locked"
												: "project-settings-extension-row"
										}
										key={extension.id}
									>
										<input
											type="checkbox"
											checked={enabled}
											disabled={!activeExtensionProfileId || locked}
											onChange={(event) =>
												toggleExtension(extension.id, event.target.checked)
											}
										/>
										<span>
											<strong>{extension.id}</strong>
											<small>
												{extension.source} · {extension.version}
											</small>
											{extension.requires?.length ? (
												<small>
													{" "}
													{t("project.settings.requires", {
														names: extension.requires.join(", "),
													})}
												</small>
											) : null}
										</span>
										{locked && (
											<Badge tone="info">
												{t("project.settings.lockedDependency")}
											</Badge>
										)}
									</label>
								);
							})}
						</section>

						{draft.projectSettingsContributions.map((contribution) => (
							<ExtensionProjectSettingsSection
								key={`${contribution.extensionId}:${contribution.namespace}`}
								contribution={contribution}
								values={projectSettings?.[contribution.namespace] ?? {}}
								onChange={(values) =>
									setProjectSettings((current) => ({
										...current,
										[contribution.namespace]: values,
									}))
								}
							/>
						))}
						<section className="project-settings-section">
							<div className="project-settings-section-heading">
								<h3>{t("project.settings.templates")}</h3>
								<Button onClick={onManageTemplates}>
									{t("project.settings.manageTemplates")}
								</Button>
							</div>
							{(draft.templates ?? []).map((template) => (
								<div
									className="project-settings-template-row"
									key={template.templateId}
								>
									<strong>{template.title}</strong>
									<span>{template.templateId}</span>
									{template.tags?.map((tag) => (
										<Badge key={tag}>{tag}</Badge>
									))}
								</div>
							))}
							{!(draft.templates ?? []).length && (
								<span>{t("project.settings.noTemplates")}</span>
							)}
						</section>
						<div className="project-settings-readonly">
							<strong>{t("project.settings.backend")}</strong>
							<code>
								{draft.backend.kind}: {draft.backend.path}
							</code>
							<span>{t("project.settings.backendMigrationNotice")}</span>
							<SelectField
								label={t("project.settings.targetBackend")}
								value={targetBackend}
								onChange={(value) =>
									setTargetBackend(value as "jsonl" | "sqlite")
								}
								options={[
									{
										value: "jsonl",
										label: t("project.settings.backendJsonl"),
									},
									{
										value: "sqlite",
										label: t("project.settings.backendSqlite"),
									},
								]}
							/>
							<div className="project-settings-migration-actions">
								<Button
									onClick={() => void previewMigration()}
									disabled={busy || targetBackend === draft.backend.kind}
								>
									{t("project.settings.previewMigration")}
								</Button>
								{migrationPlan?.status === "plan" && (
									<Button
										variant="primary"
										onClick={() => void applyMigration()}
										disabled={busy}
									>
										{t("project.settings.applyMigration")}
									</Button>
								)}
							</div>
							{migrationPlan?.status === "plan" && (
								<span>
									{t("project.settings.migrationSummary", {
										history: migrationPlan.plan.historyCount,
										scratchpads: migrationPlan.plan.scratchpadCount,
									})}
								</span>
							)}
							{client.getMigrationJournal && (
								<MigrationJournalSection
									journal={migrationJournal}
									busy={journalBusy}
									result={journalResult}
									onRefresh={() => void refreshJournal()}
									onRecover={() => void recoverMigration()}
									onDiscard={() => void discardMigration()}
									onResume={() => void resumeMigration()}
								/>
							)}
							<strong>{t("project.settings.resources")}</strong>
							<code>
								{jsonText({
									resources: draft.resources,
									historyResources: draft.historyResources,
									scratchpadResources: draft.scratchpadResources,
								})}
							</code>
						</div>
						{error && <Diagnostic severity="error">{error}</Diagnostic>}
					</div>
				) : (
					<div className="project-settings-loading">
						{t("project.settings.loading")}
					</div>
				)}
				<footer className="modal-footer">
					<Button onClick={onClose} disabled={busy}>
						{t("project.settings.cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => void save()}
						disabled={!draft || busy}
					>
						{t("project.settings.save")}
					</Button>
				</footer>
			</div>
		</div>
	);
}

function SelectField({
	label,
	value,
	options,
	onChange,
	emptyLabel,
}: {
	readonly label: string;
	readonly value: string;
	readonly options: readonly {
		readonly value: string;
		readonly label: string;
	}[];
	readonly onChange: (value: string) => void;
	readonly emptyLabel?: string;
}) {
	return (
		<label className="field">
			<span className="field-label">{label}</span>
			<select
				className="input"
				value={value}
				onChange={(event) => onChange(event.target.value)}
			>
				{emptyLabel && <option value="">{emptyLabel}</option>}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

function ExtensionProjectSettingsSection({
	contribution,
	values,
	onChange,
}: {
	readonly contribution: ProjectSettingsContributionDto;
	readonly values: Readonly<Record<string, unknown>>;
	readonly onChange: (values: Readonly<Record<string, unknown>>) => void;
}) {
	return (
		<section className="project-settings-extension-section">
			<strong>{contribution.title}</strong>
			{contribution.description && <span>{contribution.description}</span>}
			{contribution.schema.map((entry) => {
				const value = entry.path.reduce<unknown>(
					(current, key) =>
						current && typeof current === "object"
							? (current as Record<string, unknown>)[key]
							: undefined,
					values,
				);
				const setValue = (next: unknown) =>
					onChange(setNestedValue(values, entry.path, next));
				return (
					<ProjectSettingField
						key={entry.path.join(".")}
						entry={entry}
						value={value}
						onChange={setValue}
					/>
				);
			})}
		</section>
	);
}

type ProjectSettingEntry = ProjectSettingsContributionDto["schema"][number];

function ProjectSettingField({
	entry,
	value,
	onChange,
}: {
	readonly entry: ProjectSettingEntry;
	readonly value: unknown;
	readonly onChange: (value: unknown) => void;
}) {
	const { t } = useI18n();
	const hint = entry.description;
	const isKeymap = entry.type === "keymap" || entry.widget === "keymap";
	const isObject = entry.type === "object" || entry.type === "json";
	const hasDefault = entry.default !== undefined;
	const reset = () => onChange(entry.default);

	const renderInput = () => {
		if (entry.sensitive) {
			return (
				<TextInput
					label={entry.title}
					type="password"
					value={value == null ? "" : String(value)}
					placeholder={t("project.settings.sensitivePlaceholder")}
					hint={hint}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
		}
		if (entry.type === "enum") {
			const options = (entry.enumOptions ?? []).map((option) => ({
				value: option.id,
				label: option.label,
			}));
			return (
				<SelectField
					label={entry.title}
					value={String(value ?? "")}
					onChange={onChange}
					options={options}
				/>
			);
		}
		if (entry.type === "boolean") {
			return (
				<label className="project-settings-checkbox">
					<input
						type="checkbox"
						checked={value === true}
						onChange={(event) => onChange(event.target.checked)}
					/>
					{entry.title}
				</label>
			);
		}
		if (entry.type === "array" || entry.widget === "tag-input") {
			const delimiters =
				entry.type === "array" || entry.type === "string"
					? entry.tagDelimiters
					: undefined;
			return (
				<TagInputField
					label={entry.title}
					tags={Array.isArray(value) ? value.map(String) : []}
					delimiters={delimiters}
					hint={hint}
					onChange={onChange}
				/>
			);
		}
		if (isKeymap) {
			return (
				<KeymapTableField
					label={entry.title}
					bindings={Array.isArray(value) ? value : []}
					hint={hint}
					onChange={onChange}
				/>
			);
		}
		if (entry.type === "number") {
			return (
				<TextInput
					label={entry.title}
					type="number"
					value={value == null ? "" : String(value)}
					min={entry.min}
					max={entry.max}
					step={entry.step}
					placeholder={entry.placeholder}
					hint={hint}
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
		if (isObject) {
			return (
				<label className="field">
					<span className="field-label">{entry.title}</span>
					<textarea
						className="input"
						value={JSON.stringify(value ?? {}, null, 2)}
						aria-invalid={false}
						onChange={(event) => {
							try {
								onChange(JSON.parse(event.target.value));
							} catch {
								/* validation remains host-owned */
							}
						}}
					/>
					{hint && <span className="field-hint">{hint}</span>}
				</label>
			);
		}
		return (
			<TextInput
				label={entry.title}
				value={value == null ? "" : String(value)}
				placeholder={entry.placeholder}
				hint={hint}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	};

	return (
		<div className="project-settings-field">
			{entry.type === "boolean" ? (
				renderInput()
			) : (
				<>
					{renderInput()}
					{hasDefault && (
						<button
							type="button"
							className="project-settings-reset"
							onClick={reset}
							title={t("project.settings.reset")}
						>
							↺ {t("project.settings.reset")}
						</button>
					)}
				</>
			)}
		</div>
	);
}

function TagInputField({
	label,
	tags,
	hint,
	delimiters,
	onChange,
}: {
	readonly label: string;
	readonly tags: readonly string[];
	readonly hint?: string;
	readonly delimiters?: readonly string[];
	readonly onChange: (tags: readonly string[]) => void;
}) {
	const { t } = useI18n();
	const [input, setInput] = useState("");
	const delims = delimiters ?? [",", " "];

	const addTag = (text: string) => {
		const trimmed = text.trim();
		if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
		setInput("");
	};

	const removeTag = (index: number) =>
		onChange(tags.filter((_, i) => i !== index));

	return (
		<div className="field">
			<span className="field-label">{label}</span>
			<div className="settings-tag-container">
				{tags.map((tag, idx) => (
					<span key={`${tag}-${idx}`} className="settings-tag-pill">
						{tag}
						<button
							type="button"
							className="settings-tag-remove"
							onClick={() => removeTag(idx)}
						>
							×
						</button>
					</span>
				))}
				<input
					className="settings-tag-input"
					type="text"
					value={input}
					placeholder={
						tags.length === 0 ? t("project.settings.tagPlaceholder") : ""
					}
					onChange={(event) => {
						const val = event.target.value;
						if (delims.some((d) => val.includes(d))) {
							const parts = val.split(
								new RegExp(`[${delims.map((d) => `\\${d}`).join("")}]`),
							);
							for (const part of parts) if (part.trim()) addTag(part);
						} else {
							setInput(val);
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addTag(input);
						} else if (event.key === "Backspace" && !input && tags.length > 0) {
							removeTag(tags.length - 1);
						}
					}}
				/>
			</div>
			{hint && <span className="field-hint">{hint}</span>}
		</div>
	);
}

interface KeybindingRow {
	readonly chord: string;
	readonly command: string;
}

function KeymapTableField({
	label,
	bindings,
	hint,
	onChange,
}: {
	readonly label: string;
	readonly bindings: readonly unknown[];
	readonly hint?: string;
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

	const removeBinding = (index: number) =>
		onChange(typedBindings.filter((_, i) => i !== index));

	return (
		<div className="field">
			<span className="field-label">{label}</span>
			<div className="settings-keymap-table-wrapper">
				<table className="settings-keymap-table">
					<thead>
						<tr>
							<th>{t("project.settings.keymapCommand")}</th>
							<th>{t("project.settings.keymapChord")}</th>
							<th>{t("project.settings.actions")}</th>
						</tr>
					</thead>
					<tbody>
						{typedBindings.map((binding, idx) => (
							<tr key={`${binding.command}-${idx}`}>
								<td>
									<code>{binding.command}</code>
								</td>
								<td>
									<kbd className="settings-chord-badge">{binding.chord}</kbd>
								</td>
								<td>
									<button
										type="button"
										className="settings-tag-remove"
										onClick={() => removeBinding(idx)}
									>
										×
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="settings-keymap-add-row">
					<input
						className="input"
						type="text"
						placeholder={t("project.settings.keymapCommandPlaceholder")}
						value={newCommand}
						onChange={(event) => setNewCommand(event.target.value)}
					/>
					<input
						className="input"
						type="text"
						placeholder={t("project.settings.keymapChordPlaceholder")}
						value={newChord}
						onChange={(event) => setNewChord(event.target.value)}
					/>
					<Button variant="primary" onClick={addBinding}>
						{t("project.settings.add")}
					</Button>
				</div>
			</div>
			{hint && <span className="field-hint">{hint}</span>}
		</div>
	);
}

function setNestedValue(
	values: Readonly<Record<string, unknown>>,
	path: readonly string[],
	value: unknown,
): Readonly<Record<string, unknown>> {
	if (!path.length) return values;
	const [head, ...tail] = path;
	if (!head) return values;
	return {
		...values,
		[head]: tail.length
			? setNestedValue(
					(values[head] as Readonly<Record<string, unknown>> | undefined) ?? {},
					tail,
					value,
				)
			: value,
	};
}

function formatJournalTime(value: string): string {
	const stamp = Date.parse(value);
	if (!Number.isFinite(stamp)) return value || "—";
	return new Date(stamp).toLocaleString();
}

function MigrationJournalSection({
	journal,
	busy,
	result,
	onRefresh,
	onRecover,
	onDiscard,
	onResume,
}: {
	readonly journal: ProjectMigrationJournalStatusDto | null;
	readonly busy: boolean;
	readonly result: ProjectMigrationRecoveryResultDto | null;
	readonly onRefresh: () => void;
	readonly onRecover: () => void;
	readonly onDiscard: () => void;
	readonly onResume: () => void;
}) {
	const { t } = useI18n();
	const record = journal?.journal ?? null;
	const hasJournal = record !== null;
	const statusLabel = record
		? t(`project.settings.migrationJournalState.${record.status}`)
		: "";
	const statusTone: "info" | "warning" | "danger" = record
		? record.status === "failed"
			? "danger"
			: record.status === "finalizing"
				? "warning"
				: "info"
		: "info";
	const recoveryMessage = (() => {
		if (!result) return null;
		switch (result.action) {
			case "noJournal":
				return t("project.settings.journalRecovery.noJournal");
			case "invalidJournalCleared":
				return t("project.settings.journalRecovery.invalidJournalCleared");
			case "migrationCompleted":
				return t("project.settings.journalRecovery.migrationCompleted");
			case "targetDiscarded":
				return result.removedTargetPath
					? t("project.settings.journalRecovery.removedTargetPath", {
							path: result.removedTargetPath,
						})
					: t("project.settings.journalRecovery.targetDiscarded");
			case "targetRetained":
				return t("project.settings.journalRecovery.targetRetained", {
					reason: result.retainedReason ?? "",
				});
			case "activeMigrationRetained":
				return t("project.settings.journalRecovery.activeMigrationRetained");
			default:
				return null;
		}
	})();

	return (
		<section className="project-settings-migration-journal">
			<div className="project-settings-section-heading">
				<h3>{t("project.settings.migrationJournal")}</h3>
				<Button variant="ghost" onClick={onRefresh} disabled={busy}>
					{t("project.settings.refreshJournal")}
				</Button>
			</div>
			{!hasJournal && (
				<span className="project-settings-hint">
					{t("project.settings.migrationJournalNone")}
				</span>
			)}
			{hasJournal && record && (
				<div className="project-settings-journal-detail">
					<div className="project-settings-journal-status">
						<Badge tone={statusTone}>{statusLabel}</Badge>
						{journal?.stale && (
							<Badge tone="warning">
								{t("project.settings.migrationJournalAbandoned")}
							</Badge>
						)}
						{record.resumable && (
							<Badge tone="info">
								{t("project.settings.migrationJournalResumable")}
							</Badge>
						)}
					</div>
					<dl className="project-settings-journal-meta">
						<dt>{t("project.settings.migrationJournalTarget")}</dt>
						<dd>
							<code>
								{record.target.kind}: {record.target.path}
							</code>
						</dd>
						<dt>{t("project.settings.migrationJournalStarted")}</dt>
						<dd>{formatJournalTime(record.startedAt)}</dd>
						<dt>{t("project.settings.migrationJournalUpdated")}</dt>
						<dd>{formatJournalTime(record.updatedAt)}</dd>
						<dt>{t("project.settings.migrationJournalOwner")}</dt>
						<dd>
							{t("project.settings.migrationJournalOwner", {
								pid: record.owner.pid,
								hostname: record.owner.hostname,
							})}
						</dd>
						<dt>{t("project.settings.migrationJournalCopied")}</dt>
						<dd>
							{t("project.settings.migrationJournalCopied", {
								history: record.copiedHistory,
								scratchpads: record.copiedScratchpads,
							})}
						</dd>
						{record.error && (
							<>
								<dt>{t("project.settings.migrationJournalError")}</dt>
								<dd className="project-settings-journal-error">
									{record.error}
								</dd>
							</>
						)}
					</dl>
					<div className="project-settings-migration-actions">
						{record.resumable && (
							<Button
								variant="primary"
								onClick={onResume}
								disabled={busy || journal?.stale !== true}
							>
								{t("project.settings.resumeMigration")}
							</Button>
						)}
						<Button onClick={onRecover} disabled={busy}>
							{t("project.settings.recoverMigration")}
						</Button>
						<Button
							variant="danger"
							onClick={onDiscard}
							disabled={busy || journal?.stale !== true}
						>
							{t("project.settings.discardMigration")}
						</Button>
					</div>
				</div>
			)}
			{recoveryMessage && (
				<Diagnostic
					severity={
						result?.action === "activeMigrationRetained" ? "warning" : "info"
					}
				>
					{recoveryMessage}
				</Diagnostic>
			)}
		</section>
	);
}
