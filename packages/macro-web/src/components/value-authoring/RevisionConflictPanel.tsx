import type { ValueAuthoringWizardState } from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge, Button } from "../ui/primitives";

export function RevisionConflictPanel({
	conflict,
	baselineRevision,
	onAcknowledge,
}: {
	readonly conflict: NonNullable<ValueAuthoringWizardState["conflict"]>;
	readonly baselineRevision: string | null;
	readonly onAcknowledge: () => void;
}) {
	const { t } = useI18n();
	return (
		<section className="vs-conflict" role="alert">
			<h3>{t("valueStudio.conflict.title")}</h3>
			<dl className="vs-conflict-meta">
				<div>
					<dt>{t("valueStudio.conflict.expected")}</dt>
					<dd>
						<code>{conflict.expectedRevision ?? baselineRevision ?? "—"}</code>
					</dd>
				</div>
				<div>
					<dt>{t("valueStudio.conflict.actual")}</dt>
					<dd>
						<code>{conflict.actualRevision ?? "—"}</code>
					</dd>
				</div>
			</dl>
			<p>{t("valueStudio.conflict.explanation")}</p>
			<Button variant="primary" onClick={onAcknowledge}>
				{t("valueStudio.conflict.reloadBaseline")}
			</Button>
			<Badge tone="warning">{t("valueStudio.conflict.draftPreserved")}</Badge>
		</section>
	);
}
