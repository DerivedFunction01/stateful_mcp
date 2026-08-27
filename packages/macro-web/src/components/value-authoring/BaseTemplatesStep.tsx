import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";

/**
 * Bounded, model-backed surface for date-time formats. Editing arrives with
 * the templates slice; this renders the current stable-ID rows.
 */
export function BaseTemplatesStep({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	const formats = store.view
		.stableIdEntries()
		.filter((entry) => entry.kind === "dateTimeFormats");
	return (
		<div className="vs-step">
			<h3>{t("valueStudio.step.baseTemplates.title")}</h3>
			<p className="vs-step-note">
				{t("valueStudio.placeholder.templatesNote")}
			</p>
			{formats.length === 0 ? (
				<p className="vs-empty-note">{t("valueStudio.scope.noEntries")}</p>
			) : (
				<ul className="vs-entry-rows">
					{formats.map((entry) => (
						<li key={entry.id} className="vs-entry-row">
							<code>{entry.id}</code>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
