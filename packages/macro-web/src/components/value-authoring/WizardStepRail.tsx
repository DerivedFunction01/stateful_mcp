import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
	WizardStepId,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";

const STEP_TITLE_KEY: Record<WizardStepId, string> = {
	"scope-profile": "valueStudio.step.scopeProfile.title",
	"numerics-lexicon": "valueStudio.step.numericsLexicon.title",
	"base-templates": "valueStudio.step.baseTemplates.title",
	combinators: "valueStudio.step.combinators.title",
	sandbox: "valueStudio.step.sandbox.title",
};

function stepStatus(
	state: ValueAuthoringWizardState,
	step: WizardStepId,
): "current" | "errors" | "warnings" | "locked" | "available" {
	if (state.conflict && state.conflict.originStep === step) return "locked";
	const count = state.fieldDiagnostics[`${step}`] ?? [];
	const hasErrors = count.some((item) => item.severity === "error");
	if (step === state.step) return "current";
	return hasErrors ? "errors" : "available";
}

export function WizardStepRail({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	const steps: readonly WizardStepId[] = [
		"scope-profile",
		"numerics-lexicon",
		"base-templates",
		"combinators",
		"sandbox",
	];
	return (
		<nav className="vs-rail" aria-label={t("valueStudio.rail.label")}>
			<ol>
				{steps.map((step, index) => {
					const status = stepStatus(state, step);
					const denial = state.guardDenials.find((item) => item.to === step);
					return (
						<li key={step} className={`vs-rail-item ${status}`}>
							<button
								type="button"
								onClick={() => store.actions.goToStep(step)}
								disabled={status === "locked"}
								aria-current={step === state.step ? "step" : undefined}
							>
								<span className="vs-rail-marker">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="vs-rail-copy">
									<strong>{t(STEP_TITLE_KEY[step] as never)}</strong>
									{denial && (
										<span className="vs-rail-denial">
											{t(denial.reasonKey as never)}
										</span>
									)}
									{!denial && status === "errors" && (
										<span className="vs-rail-denial">
											{t("valueStudio.rail.hasErrors")}
										</span>
									)}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
