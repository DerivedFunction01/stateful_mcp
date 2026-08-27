import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Button, TextInput } from "../ui/primitives";
import { PreviewPanel } from "./PreviewPanel";

/**
 * Test sandbox: sample rows + semantic request builder, executed through the
 * model's typed preview action. Never parses locally; results are server DTOs.
 */
export function TestSandboxStep({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	const [sampleInput, setSampleInput] = useState("");
	const [valueKind, setValueKind] = useState(
		state.catalog?.valueKinds[0] ?? "date-time",
	);
	const [requiredFields, setRequiredFields] = useState("");

	const valueKinds = state.catalog?.valueKinds ?? [];

	const run = () => {
		const fields = requiredFields
			.split(",")
			.map((field) => field.trim())
			.filter(Boolean);
		store.actions.setSandboxRequest({
			valueKind,
			...(fields.length > 0 ? { requiredFields: fields } : {}),
		});
		void store.actions.runSandbox();
	};

	return (
		<div className="vs-step vs-sandbox">
			<h3>{t("valueStudio.step.sandbox.title")}</h3>
			<p className="vs-step-note">{t("valueStudio.preview.previewOnly")}</p>
			<div className="vs-sandbox-controls">
				<TextInput
					label={t("valueStudio.sandbox.sampleInput")}
					value={sampleInput}
					onChange={(event) => {
						setSampleInput(event.target.value);
						store.actions.setSandboxSamples([{ input: event.target.value }]);
					}}
				/>
				<TextInput
					label={t("valueStudio.sandbox.valueKind")}
					value={valueKind}
					hint={
						valueKinds.length > 0
							? `${t("valueStudio.sandbox.knownKinds")}: ${valueKinds.join(", ")}`
							: undefined
					}
					onChange={(event) => setValueKind(event.target.value)}
				/>
				<TextInput
					label={t("valueStudio.sandbox.requiredFields")}
					hint={t("valueStudio.sandbox.requiredFieldsHint")}
					value={requiredFields}
					onChange={(event) => setRequiredFields(event.target.value)}
				/>
				<Button
					variant="primary"
					disabled={!sampleInput.trim() || state.preview.status === "running"}
					onClick={run}
				>
					{state.preview.status === "running"
						? t("valueStudio.sandbox.running")
						: t("valueStudio.sandbox.run")}
				</Button>
			</div>
			{state.preview.status === "rejected" && state.preview.reasonKey && (
				<p className="vs-empty-note" role="alert">
					{t(state.preview.reasonKey as never)}
				</p>
			)}
			<PreviewPanel
				staleCount={state.preview.staleCount}
				preview={
					state.preview.results.length > 0
						? {
								graphFingerprint: state.validation.graphFingerprint ?? "",
								samples: state.preview.results.map((result) => ({
									...result,
									rejected: result.rejected ?? [],
								})),
							}
						: null
				}
			/>
		</div>
	);
}
