import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
	WizardStepId,
} from "@stateful-mcp/macro/workspace/config/wizard";
import type { ValueAuthoringProfileDto } from "@stateful-mcp/macro-protocol";
import { useEffect } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { valueStudioDirtyRegistry } from "../../state/value-authoring/dirty-registry";
import { Loading } from "../ui/primitives";
import { BaseTemplatesStep } from "./BaseTemplatesStep";
import { CombinatorsStep } from "./CombinatorsStep";
import { NumericsLexiconStep } from "./NumericsLexiconStep";
import { ScopeProfileStep } from "./ScopeProfileStep";
import { TestSandboxStep } from "./TestSandboxStep";
import { ValueStudioHeader } from "./ValueStudioHeader";
import { WizardInspector } from "./WizardInspector";
import { WizardStepRail } from "./WizardStepRail";

const STEP_COMPONENT: Record<
	WizardStepId,
	(props: {
		readonly state: ValueAuthoringWizardState;
		readonly store: ValueAuthoringWizardStore;
	}) => React.JSX.Element
> = {
	"scope-profile": ScopeProfileStep,
	"numerics-lexicon": NumericsLexiconStep,
	"base-templates": BaseTemplatesStep,
	combinators: CombinatorsStep,
	sandbox: TestSandboxStep,
};

export function ValueStudio({
	store,
	initialProfileId,
}: {
	readonly store: ValueAuthoringWizardStore;
	/** Profile selected before the wizard mounts (snapshot active profile). */
	readonly initialProfileId?: string;
}) {
	const state = store.getState();
	const { t } = useI18n();

	useEffect(() => {
		valueStudioDirtyRegistry.set(state.dirty);
		return () => valueStudioDirtyRegistry.set(false);
	}, [state.dirty]);

	useEffect(() => {
		if (!state.ready && initialProfileId && !state.lastError) {
			void store.actions.startEdit(initialProfileId);
		}
	}, [state.ready, state.lastError, initialProfileId, store]);

	if (state.lastError && !state.ready) {
		return (
			<div className="value-studio vs-error-state" role="alert">
				<p>
					{t(
						state.lastError.messageKey as never,
						state.lastError.messageParams,
					)}
				</p>
				<button type="button" onClick={() => void store.actions.retryLast()}>
					{t("valueStudio.action.retry")}
				</button>
			</div>
		);
	}

	if (!state.ready) {
		return (
			<div className="value-studio">
				<Loading label={t("valueStudio.loading")} />
			</div>
		);
	}

	const StepComponent = STEP_COMPONENT[state.step];
	const draft =
		state.localProfile as unknown as ValueAuthoringProfileDto | null;

	return (
		<div className="value-studio">
			<ValueStudioHeader state={state} store={store} />
			<div className="vs-body">
				<WizardStepRail state={state} store={store} />
				<main className="vs-canvas">
					<StepComponent key={state.step} state={state} store={store} />
					{draft === null && (
						<p className="vs-empty-note">{t("valueStudio.scope.pickPrompt")}</p>
					)}
				</main>
				<WizardInspector state={state} store={store} />
			</div>
		</div>
	);
}
