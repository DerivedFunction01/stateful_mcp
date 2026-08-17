import {
	type TuiCompletionCandidate,
	TuiCompletionPopup,
} from "../../ui/primitives/TuiCompletionPopup";
import { GlobalThemeRegistry } from "../../ui/theme";
import { createMockWorkspace } from "../mock-workspace";
import type { TuiStory } from "../story-contract";

const CANDIDATES: readonly TuiCompletionCandidate[] = [
	{
		id: "c1",
		label: "^deploy",
		kind: "Macro",
		detail: "^deploy service=<id> env=<tier> [replicas=<n>]",
		documentation:
			"Triggers blue-green deployment of the designated microservice container to the target environment cluster.",
		params: [
			{
				name: "service",
				type: "string",
				description: "api | auth | worker",
				required: true,
			},
			{
				name: "env",
				type: "string",
				description: "dev | staging | prod",
				required: true,
			},
			{ name: "replicas", type: "number", description: "Default: 2" },
		],
		snippet: "^deploy service=api env=production replicas=3",
	},
	{
		id: "c2",
		label: "^echo",
		kind: "Macro",
		detail: "^echo message=<string>",
		documentation:
			"Prints an echo message or formatted JSON payload directly to the session output buffer.",
		params: [
			{
				name: "message",
				type: "string",
				description: "Text or template expression",
				required: true,
			},
		],
		snippet: '^echo message="Deployment started successfully"',
	},
	{
		id: "c3",
		label: "^calc",
		kind: "Macro",
		detail: "^calc expr=<math>",
		documentation:
			"Evaluates mathematical expressions and unit conversions in an isolated V8 sandbox.",
		params: [
			{
				name: "expr",
				type: "string",
				description: "Arithmetic formula e.g. '128 * 1024'",
				required: true,
			},
		],
	},
	{
		id: "c4",
		label: "service",
		kind: "Slot",
		detail: "service: api | auth | worker | gateway",
		documentation:
			"Designated microservice identifier registered in the active workspace schema.",
	},
	{
		id: "c5",
		label: "env",
		kind: "Slot",
		detail: "env: dev | staging | prod",
		documentation: "Target runtime environment deployment tier.",
	},
	{
		id: "c6",
		label: "timeoutMs",
		kind: "Property",
		detail: "timeoutMs: number = 5000",
		documentation:
			"Maximum execution time in milliseconds before aborting transaction.",
	},
];

const mockWsEn = createMockWorkspace({ locale: "en" });
const mockWsEs = createMockWorkspace({ locale: "es" });

export const completionPopupStory: TuiStory = {
	id: "completion-popup",
	title: "Completion Popup & Doc Sidecar",
	category: "Modals",
	states: [
		"macro-candidate",
		"echo-candidate",
		"slot-candidate",
		"spanish-i18n",
		"custom-keymap",
		"compact-no-sidecar",
	],
	render(context) {
		const stateId = context.stateId;
		const width = Math.min(68, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();

		let selectedIndex = 0;
		if (stateId === "echo-candidate") selectedIndex = 1;
		if (stateId === "slot-candidate") selectedIndex = 3;

		const isSpanish = stateId === "spanish-i18n";
		const i18n = isSpanish ? mockWsEs.workspace.i18n : mockWsEn.workspace.i18n;

		const keymap =
			stateId === "custom-keymap"
				? {
						completeKey: "Ctrl+Space",
						insertKey: "Enter",
						dismissKey: "Ctrl+C",
						navigateKey: "Ctrl+N/P",
					}
				: undefined;

		const showSidecar = stateId !== "compact-no-sidecar";

		return (
			<box padding={1}>
				<TuiCompletionPopup
					candidates={CANDIDATES}
					selectedIndex={selectedIndex}
					width={showSidecar ? width : 32}
					showSidecar={showSidecar}
					theme={theme}
					i18n={i18n}
					keymap={keymap}
				/>
			</box>
		);
	},
};
