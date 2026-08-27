import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { listCombinatorNodes } from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";

/** Read-mostly recipe graph listing with capability signatures. */
export function CombinatorsStep({
	state,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	if (!state.localProfile) {
		return (
			<div className="vs-step">
				<h3>{t("valueStudio.step.combinators.title")}</h3>
				<p className="vs-empty-note">{t("valueStudio.scope.pickPrompt")}</p>
			</div>
		);
	}
	const nodes = listCombinatorNodes(state.localProfile);
	return (
		<div className="vs-step">
			<h3>{t("valueStudio.step.combinators.title")}</h3>
			<p className="vs-step-note">
				{t("valueStudio.placeholder.combinatorsNote")}
			</p>
			<ul className="vs-recipe-list">
				{nodes.map((node) => (
					<li key={node.recipeId} className="vs-recipe-row">
						<code>{node.recipeId}</code>
						{node.capability?.valueKind && (
							<Badge tone="accent">
								{node.capability.valueKind}
								{(node.capability.providedFields?.length ?? 0) > 0 &&
									`: ${node.capability.providedFields?.join(", ")}`}
							</Badge>
						)}
						{!node.enabled && (
							<Badge tone="warning">
								{t("valueStudio.combinators.disabled")}
							</Badge>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
