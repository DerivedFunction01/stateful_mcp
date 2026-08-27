import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import type { SettingsScope } from "@stateful-mcp/macro-protocol";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge, Button, SelectField } from "../ui/primitives";

const SCOPE_KEYS: Record<SettingsScope, string> = {
	user: "settings.scope.user",
	workspace: "settings.scope.workspace",
	folder: "settings.scope.folder",
};

function validationBadge(state: ValueAuthoringWizardState) {
	const i18n = useI18n();
	const validation = state.validation;
	if (validation.status === "pending")
		return (
			<Badge tone="neutral">{i18n.t("valueStudio.validation.pending")}</Badge>
		);
	if (validation.valid === true)
		return (
			<Badge tone="success">{i18n.t("valueStudio.validation.valid")}</Badge>
		);
	if (validation.valid === false)
		return (
			<Badge tone="warning">{i18n.t("valueStudio.validation.invalid")}</Badge>
		);
	return <Badge tone="neutral">{i18n.t("valueStudio.validation.idle")}</Badge>;
}

export function ValueStudioHeader({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const i18n = useI18n();
	const { t } = i18n;
	const saving = state.saveState.kind === "saving";
	const saveable =
		!saving &&
		state.dirty &&
		state.ready &&
		state.conflict === null &&
		state.lastError === null;
	const scopedSupported = (scope: SettingsScope) =>
		state.scopeAvailability.find((item) => item.scope === scope)?.supported ??
		true;

	return (
		<header className="vs-header">
			<div className="vs-header-identity">
				<h2>{t("valueStudio.title")}</h2>
				{state.editedProfileId && (
					<span className="vs-profile-line">
						{t("valueStudio.header.profile")}:{" "}
						<code>{state.editedProfileId}</code>
						{state.activeProfileId === state.editedProfileId ? (
							<Badge tone="accent">{t("valueStudio.header.badgeActive")}</Badge>
						) : (
							<Badge tone="neutral">{t("valueStudio.header.badgeDraft")}</Badge>
						)}
					</span>
				)}
			</div>
			<div className="vs-header-status">
				{state.dirty && (
					<Badge tone="warning">{t("valueStudio.header.dirty")}</Badge>
				)}
				{validationBadge(state)}
				{state.conflict && (
					<Badge tone="warning">{t("valueStudio.conflict.badge")}</Badge>
				)}
				<SelectField
					label={t("valueStudio.header.scope")}
					value={state.scope ?? ""}
					onChange={(value) => {
						if (value) store.actions.chooseScope(value as SettingsScope);
					}}
					options={[
						{ id: "", label: t("valueStudio.header.scopeChoose") },
						...(["user", "workspace", "folder"] as const)
							.filter(scopedSupported)
							.map((scope) => ({
								id: scope,
								label: t(SCOPE_KEYS[scope] as never),
							})),
					]}
				/>
			</div>
			<div className="vs-header-actions">
				<Button
					variant="ghost"
					onClick={() => void store.actions.refreshBaseline()}
					disabled={!state.ready || saving}
				>
					{t("valueStudio.action.reload")}
				</Button>
				<Button
					variant="primary"
					disabled={!saveable}
					onClick={() => void store.actions.save()}
				>
					{saving
						? t("valueStudio.action.saving")
						: t("valueStudio.action.save")}
				</Button>
			</div>
		</header>
	);
}
