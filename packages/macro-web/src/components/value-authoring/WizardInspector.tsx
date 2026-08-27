import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";
import { DiagnosticList } from "./DiagnosticList";
import { PreviewPanel } from "./PreviewPanel";
import { RevisionConflictPanel } from "./RevisionConflictPanel";

export function WizardInspector({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	const allDiagnostics = Object.values(state.fieldDiagnostics).flat();
	return (
		<aside
			className="vs-inspector"
			aria-label={t("valueStudio.inspector.label")}
		>
			{state.conflict && (
				<RevisionConflictPanel
					conflict={state.conflict}
					baselineRevision={state.baselineRevision}
					onAcknowledge={() => void store.actions.acknowledgeConflict()}
				/>
			)}
			{state.lastError && (
				<section className="vs-transport-error" role="alert">
					<h3>{t("valueStudio.errors.title")}</h3>
					<p>
						{t(
							state.lastError.messageKey as never,
							state.lastError.messageParams,
						)}
					</p>
					<button type="button" onClick={() => void store.actions.retryLast()}>
						{t("valueStudio.action.retry")}
					</button>
				</section>
			)}
			{(state.preview.status === "settled" ||
				state.preview.status === "running" ||
				state.preview.results.length > 0) && (
				<PreviewPanel
					staleCount={state.preview.staleCount}
					preview={
						state.preview.results.length > 0 || state.preview.samples.length > 0
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
			)}
			<section className="vs-inspector-diagnostics">
				<h3>{t("valueStudio.inspector.diagnostics")}</h3>
				<DiagnosticList diagnostics={allDiagnostics} />
			</section>
			<section className="vs-inspector-meta">
				<h3>{t("valueStudio.inspector.graphTitle")}</h3>
				<p className="vs-preview-meta">
					<span>
						{t("valueStudio.inspector.revision")}:{" "}
						<code>{state.baselineRevision ?? "—"}</code>
					</span>
					<span>
						{t("valueStudio.inspector.fingerprint")}:{" "}
						<code>{state.validation.graphFingerprint ?? "—"}</code>
					</span>
				</p>
			</section>
		</aside>
	);
}
