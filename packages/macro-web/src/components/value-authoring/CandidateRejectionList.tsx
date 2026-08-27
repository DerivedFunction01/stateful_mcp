import type { ValueSampleResultDto } from "@stateful-mcp/macro-protocol";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";

const REJECT_REASON_KEY: Record<string, string> = {
	capability_mismatch: "valueStudio.preview.reason.capabilityMismatch",
	invalid_value: "valueStudio.preview.reason.invalidValue",
	disabled: "valueStudio.preview.reason.disabled",
	not_enabled: "valueStudio.preview.reason.notEnabled",
};

export function CandidateRejectionList({
	results,
}: {
	readonly results: readonly ValueSampleResultDto[];
}) {
	const { t } = useI18n();
	const rejections = results.flatMap((result) =>
		(result.rejected ?? []).map((rejected) => ({
			input: result.input,
			reason: rejected.reason,
		})),
	);
	if (rejections.length === 0) return null;
	return (
		<div className="vs-rejections">
			<h4>{t("valueStudio.preview.rejectedTitle")}</h4>
			<ul>
				{rejections.map((rejection, index) => (
					<li key={`${rejection.input}-${index}`}>
						<code>{rejection.input}</code>
						<Badge tone="warning">
							{t(
								(REJECT_REASON_KEY[rejection.reason] ??
									"valueStudio.preview.reason.unknown") as never,
							)}
						</Badge>
					</li>
				))}
			</ul>
		</div>
	);
}
