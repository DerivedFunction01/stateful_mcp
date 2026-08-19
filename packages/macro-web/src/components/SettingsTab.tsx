import type { SettingsUiSection } from "@stateful-mcp/macro/workspace/config/settings-ui-model";
import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import { Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/i18n";
import {
	Button,
	Card,
	Diagnostic,
	SelectField,
	TextInput,
	Toggle,
} from "./ui/primitives";

const sections: readonly Pick<
	SettingsUiSection,
	"id" | "title" | "description"
>[] = [
	{
		id: "appearance",
		title: "common.appearance",
		description: "common.themeDensity",
	},
	{ id: "profile", title: "common.profile", description: "common.profileApps" },
	{ id: "editor", title: "common.editor", description: "common.editorKeys" },
];

export function SettingsTab({
	client,
	snapshot,
}: {
	readonly client: HostClient;
	readonly snapshot?: WorkspaceSnapshot;
}) {
	const { t, locale, setLocale } = useI18n();
	const [query, setQuery] = useState("");
	const [section, setSection] = useState<string>("appearance");
	const [dirty, setDirty] = useState(false);
	const [vimEnabled, setVimEnabled] = useState(true);
	const filtered = useMemo(
		() =>
			sections.filter((item) =>
				`${t(item.title ?? item.id)} ${t(item.description ?? item.id)}`
					.toLowerCase()
					.includes(query.toLowerCase()),
			),
		[query, t],
	);

	const apply = async (
		operation: Parameters<HostClient["applySettings"]>[0],
	) => {
		await client.applySettings(operation);
		setDirty(false);
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
					<Button
						variant="ghost"
						disabled={!dirty}
						onClick={() =>
							void apply({
								operation: "discard",
								expectedRevision: snapshot?.revision,
							})
						}
					>
						{t("settings.discard")}
					</Button>
					<Button
						variant="primary"
						disabled={!dirty}
						onClick={() =>
							void apply({
								operation: "save",
								expectedRevision: snapshot?.revision,
							})
						}
					>
						{t("settings.actions.save")}
					</Button>
				</div>
			</header>
			<div className="settings-layout">
				<aside className="settings-sidebar">
					<label className="search-box">
						<Search size={16} />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("settings.search")}
							aria-label={t("settings.search")}
						/>
					</label>
					<nav aria-label={t("settings.title")}>
						{filtered.map((item) => (
							<button
								type="button"
								key={item.id}
								className={
									section === item.id
										? "settings-nav-item active"
										: "settings-nav-item"
								}
								onClick={() => setSection(item.id)}
							>
								<strong>{t(item.title ?? item.id)}</strong>
								<span>{t(item.description ?? item.id)}</span>
							</button>
						))}
					</nav>
				</aside>
				<main className="settings-content">
					{section === "appearance" && (
						<Card
							title={t("settings.category.appearance")}
							action={
								<span className="section-count">
									{t("settings.settingsCount")}
								</span>
							}
						>
							<div className="form-grid">
								<SelectField
									label={t("settings.schema.appearance.theme.title")}
									value={String(
										snapshot?.settings.effective.appearance &&
											typeof snapshot.settings.effective.appearance === "object"
											? ((
													snapshot.settings.effective.appearance as Record<
														string,
														unknown
													>
												).theme ?? "midnight")
											: "midnight",
									)}
									options={[
										{ id: "midnight", label: t("theme.midnight") },
										{ id: "cloud", label: t("theme.cloud") },
										{ id: "violet", label: t("theme.violet") },
									]}
									onChange={(value) => {
										setDirty(true);
										void apply({
											operation: "set",
											path: ["appearance", "theme"],
											value,
											expectedRevision: snapshot?.revision,
										});
									}}
								/>
								<SelectField
									label={t("settings.density")}
									value="comfortable"
									options={[
										{ id: "comfortable", label: t("settings.comfortable") },
										{ id: "compact", label: t("settings.compact") },
									]}
									onChange={() => setDirty(true)}
								/>
							</div>
						</Card>
					)}
					{section === "profile" && (
						<Card title={t("settings.category.values")}>
							<div className="form-stack">
								<SelectField
									label={t("settings.profileLabel")}
									value={snapshot?.profile.id ?? "base"}
									options={[
										{
											id: snapshot?.profile.id ?? "base",
											label:
												snapshot?.profile.displayName ?? t("common.loading"),
										},
									]}
									onChange={() => setDirty(true)}
								/>
								<div className="extension-list">
									<span className="field-label">
										{t("settings.enabledApps")}
									</span>
									{(snapshot?.applications ?? []).map((application) => (
										<div className="extension-row" key={application.id}>
											<span>{application.displayName}</span>
											<span className="extension-state">
												{t("toggle.enabled")}
											</span>
										</div>
									))}
								</div>
							</div>
						</Card>
					)}
					{section === "editor" && (
						<Card title={t("settings.category.editor")}>
							<div className="form-stack">
								<Toggle
									label={t("settings.vimToggle")}
									checked={vimEnabled}
									onChange={(value) => {
										setVimEnabled(value);
										setDirty(true);
									}}
								/>
								<TextInput
									label={t("textEditor.liveOutput")}
									defaultValue="@"
									onChange={() => setDirty(true)}
									hint={t("settings.macroTokenHint")}
								/>
								<SelectField
									label={t("settings.language")}
									value={locale}
									options={[
										{ id: "en", label: "English" },
										{ id: "es", label: "Español" },
									]}
									onChange={(value) => {
										setLocale(value as "en" | "es");
										setDirty(true);
									}}
								/>
							</div>
						</Card>
					)}
					{dirty && (
						<Diagnostic severity="warning">{t("settings.unsaved")}</Diagnostic>
					)}
				</main>
			</div>
		</div>
	);
}
