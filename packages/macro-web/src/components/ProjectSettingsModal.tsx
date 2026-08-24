import type {
	ProjectConfigurationDto,
	ProjectOperationResult,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { Button, Diagnostic, TextInput } from "./ui/primitives";

function jsonText(value: unknown): string {
	return JSON.stringify(value ?? [], null, 2);
}

export function ProjectSettingsModal({
	isOpen,
	client,
	onClose,
	onUpdated,
}: {
	readonly isOpen: boolean;
	readonly client: HostClient;
	readonly onClose: () => void;
	readonly onUpdated?: (result: ProjectOperationResult) => void;
}) {
	const { t } = useI18n();
	const [configuration, setConfiguration] = useState<ProjectConfigurationDto>();
	const [draft, setDraft] = useState<ProjectConfigurationDto>();
	const [extensionsText, setExtensionsText] = useState("[]");
	const [profilesText, setProfilesText] = useState("{}");
	const [templatesText, setTemplatesText] = useState("[]");
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
			setError(t("workbench.project.settings.unavailable"));
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
				setExtensionsText(jsonText(value.extensions));
				setProfilesText(jsonText(value.extensionProfiles ?? {}));
				setTemplatesText(jsonText(value.templates ?? []));
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
	const localeOptions = ["en", "es"];

	const parseJson = <T,>(value: string, label: string): T | undefined => {
		try {
			return JSON.parse(value) as T;
		} catch {
			setError(t("workbench.project.settings.invalidJson", { field: label }));
			return undefined;
		}
	};

	const save = async () => {
		if (!draft || !configuration || !client.updateProjectConfiguration) return;
		const extensions = parseJson<ProjectConfigurationDto["extensions"]>(
			extensionsText,
			t("workbench.project.settings.extensions"),
		);
		const extensionProfiles = parseJson<
			ProjectConfigurationDto["extensionProfiles"]
		>(profilesText, t("workbench.project.settings.extensionProfiles"));
		const templates = parseJson<ProjectConfigurationDto["templates"]>(
			templatesText,
			t("workbench.project.settings.templates"),
		);
		if (!extensions || !extensionProfiles || !templates) return;
		setBusy(true);
		setError(undefined);
		try {
			const result = await client.updateProjectConfiguration(
				{ ...draft, extensions, extensionProfiles, templates, projectSettings },
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
						: t("workbench.project.settings.migrationUnavailable"),
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
						: t("workbench.project.settings.migrationUnavailable"),
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
						: t("workbench.project.settings.migrationUnavailable"),
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
							{t("workbench.project.settings.title")}
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
							label={t("workbench.project.settings.displayName")}
							value={draft.displayName}
							onChange={(event) => update({ displayName: event.target.value })}
						/>
						<TextInput
							label={t("workbench.project.settings.projectId")}
							value={draft.projectId}
							readOnly
						/>
						<SelectField
							label={t("workbench.project.settings.locale")}
							value={draft.uiLocale ?? ""}
							onChange={(value) => update({ uiLocale: value || undefined })}
							options={localeOptions.map((value) => ({
								value,
								label:
									value === "es"
										? t("workbench.project.settings.localeSpanish")
										: t("workbench.project.settings.localeEnglish"),
							}))}
							emptyLabel={t("workbench.project.settings.inheritLocale")}
						/>
						<SelectField
							label={t("workbench.project.settings.defaultProfile")}
							value={draft.defaultProfileId ?? ""}
							onChange={(value) =>
								update({ defaultProfileId: value || undefined })
							}
							options={profileIds.map((value) => ({ value, label: value }))}
							emptyLabel={t("workbench.project.settings.noProfile")}
						/>
						<SelectField
							label={t("workbench.project.settings.activeProfile")}
							value={draft.activeProfileId ?? ""}
							onChange={(value) =>
								update({ activeProfileId: value || undefined })
							}
							options={profileIds.map((value) => ({ value, label: value }))}
							emptyLabel={t("workbench.project.settings.noProfile")}
						/>
						<JsonField
							label={t("workbench.project.settings.extensions")}
							value={extensionsText}
							onChange={setExtensionsText}
						/>
						<JsonField
							label={t("workbench.project.settings.extensionProfiles")}
							value={profilesText}
							onChange={setProfilesText}
						/>
						<JsonField
							label={t("workbench.project.settings.templates")}
							value={templatesText}
							onChange={setTemplatesText}
						/>
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
						<div className="project-settings-readonly">
							<strong>{t("workbench.project.settings.backend")}</strong>
							<code>
								{draft.backend.kind}: {draft.backend.path}
							</code>
							<span>
								{t("workbench.project.settings.backendMigrationNotice")}
							</span>
							<SelectField
								label={t("workbench.project.settings.targetBackend")}
								value={targetBackend}
								onChange={(value) =>
									setTargetBackend(value as "jsonl" | "sqlite")
								}
								options={[
									{
										value: "jsonl",
										label: t("workbench.project.settings.backendJsonl"),
									},
									{
										value: "sqlite",
										label: t("workbench.project.settings.backendSqlite"),
									},
								]}
							/>
							<div className="project-settings-migration-actions">
								<Button
									onClick={() => void previewMigration()}
									disabled={busy || targetBackend === draft.backend.kind}
								>
									{t("workbench.project.settings.previewMigration")}
								</Button>
								{migrationPlan?.status === "plan" && (
									<Button
										variant="primary"
										onClick={() => void applyMigration()}
										disabled={busy}
									>
										{t("workbench.project.settings.applyMigration")}
									</Button>
								)}
							</div>
							{migrationPlan?.status === "plan" && (
								<span>
									{t("workbench.project.settings.migrationSummary", {
										history: migrationPlan.plan.historyCount,
										scratchpads: migrationPlan.plan.scratchpadCount,
									})}
								</span>
							)}
							<strong>{t("workbench.project.settings.resources")}</strong>
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
						{t("workbench.project.settings.loading")}
					</div>
				)}
				<footer className="modal-footer">
					<Button onClick={onClose} disabled={busy}>
						{t("workbench.project.settings.cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => void save()}
						disabled={!draft || busy}
					>
						{t("workbench.project.settings.save")}
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
