import type { TuiStory } from "../story-contract";
import { TuiCompletionPopup, type TuiCompletionCandidate } from "../../ui/primitives/TuiCompletionPopup";

const CANDIDATES: readonly TuiCompletionCandidate[] = [
	{ id: "c1", label: "^echo", kind: "Macro", detail: "^echo message=<string>", documentation: "Prints an echo message to output buffer." },
	{ id: "c2", label: "^deploy", kind: "Macro", detail: "^deploy service=<id> env=<target>", documentation: "Triggers deployment of designated microservice." },
	{ id: "c3", label: "^calc", kind: "Macro", detail: "^calc expr=<math>", documentation: "Evaluates mathematical expression safely." },
	{ id: "c4", label: "service", kind: "Slot", detail: "service: api | worker | gateway", documentation: "Target backend service identifier." },
	{ id: "c5", label: "env", kind: "Slot", detail: "env: dev | staging | prod", documentation: "Target runtime environment tier." },
];

export const completionPopupStory: TuiStory = {
	id: "completion-popup",
	title: "Completion Popup & Doc Sidecar",
	category: "Modals",
	states: ["first-candidate", "second-candidate", "slot-candidate"],
	render(context) {
		const width = Math.min(58, context.size.columns - 4);
		const selectedIndex = context.stateId === "second-candidate" ? 1 : context.stateId === "slot-candidate" ? 3 : 0;

		return (
			<TuiCompletionPopup
				candidates={CANDIDATES}
				selectedIndex={selectedIndex}
				width={width}
			/>
		);
	},
};
