import type {
	ProjectConfigurationDto,
	ProjectOperationResult,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button, Diagnostic, TextInput } from "./ui/primitives";

function jsonText(value: unknown): string {
	return JSON.stringify(value ?? [], null, 2);
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
	const { t } = useI18n();
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

	useEffect(() => {
		if (!isOpen) return;
		if (!client.getProjectConfiguration) {
			setError(t("project.settings.unavailable"));
			return;
		}
		setConfiguration(undefined);
		setDraft(undefined);
		setError(undefined);
		void client
			.getProjectConfiguration()
			.then((value) => {
				setConfiguration(value);
				setDraft(value);
				setActiveExtensionProfileId(value.activeExtensionProfileId ?? "");
				setProjectSettings(value.projectSettings ?? {});
				setTargetBackend(value.backend.kind);
			})
			.catch((reason: unknown) =>
				setError(reason instanceof Error ? reason.message : String(reason)),
			);
	}, [client, isOpen, t]);

	if (!isOpen) return null;

	const update = (change: Partial<ProjectConfigurationDto>) =>
		setDraft((value) => (value ? { ...value, ...change } : value));
	const profileIds = draft ? Object.keys(draft.extensionProfiles ?? {}) : [];
	const resolvedLocale = Intl.DateTimeFormat().resolvedOptions().locale;
	const localeIds = draft?.availableLocales.map((locale) => locale.id) ?? [];
	const localeDisplayNames = new Intl.DisplayNames([resolvedLocale], {
		type: "language",
	});

	const parseJson = <T,>(value: string, label: string): T | undefined => {
		try {
			return JSON.parse(value) as T;
		} catch {
			setError(t("project.settings.invalidJson", { field: label }));
			return undefined;
		}
	};

	const save = async () => {
		if (!draft || !configuration || !client.updateProjectConfiguration) return;
		const extensions = draft.extensions;
		setBusy(true);
		setError(undefined);
		try {
			const result = await client.updateProjectConfiguration(
				{
					...draft,
					extensions,
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
							<h3>{t("project.settings.extensions")}</h3>
							{draft.extensions.map((extension) => {
								const members =
									draft.extensionProfiles?.[activeExtensionProfileId] ?? [];
								const enabled = members.includes(extension.id);
								return (
									<label
										className="project-settings-extension-row"
										key={extension.id}
									>
										<input
											type="checkbox"
											checked={enabled}
											onChange={(event) => {
												const groups = draft.extensionProfiles ?? {};
												const next = new Set(
													groups[activeExtensionProfileId] ?? [],
												);
												if (event.target.checked) next.add(extension.id);
												else next.delete(extension.id);
												update({
													extensionProfiles: {
														...groups,
														[activeExtensionProfileId]: [...next],
													},
												});
											}}
										/>
										<span>
											<strong>{extension.id}</strong>
											<small>
												{extension.source} · {extension.version}
											</small>
										</span>
										{extension.requires?.map((dependency) => (
											<Badge key={dependency}>{dependency}</Badge>
										))}
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

function JsonField({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<label className="field project-settings-json-field">
			<span className="field-label">{label}</span>
			<textarea
				className="input"
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</label>
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
				if (entry.enumValues?.length)
					return (
						<SelectField
							key={entry.path.join(".")}
							label={entry.title}
							value={String(value ?? "")}
							onChange={setValue}
							options={entry.enumValues.map((option) => ({
								value: option,
								label: option,
							}))}
						/>
					);
				if (entry.type === "boolean")
					return (
						<label className="project-settings-checkbox">
							<input
								type="checkbox"
								checked={value === true}
								onChange={(event) => setValue(event.target.checked)}
							/>
							{entry.title}
						</label>
					);
				return (
					<TextInput
						key={entry.path.join(".")}
						label={entry.title}
						value={value === undefined ? "" : String(value)}
						onChange={(event) =>
							setValue(
								entry.type === "number"
									? Number(event.target.value)
									: event.target.value,
							)
						}
					/>
				);
			})}
		</section>
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
