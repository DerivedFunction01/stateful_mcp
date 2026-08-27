import type { ValuePreviewDto } from "@stateful-mcp/macro-protocol";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";
import { CandidateRejectionList } from "./CandidateRejectionList";
import { CanonicalValueView } from "./CanonicalValueView";

export function PreviewPanel({
	preview,
	staleCount,
}: {
	readonly preview: ValuePreviewDto | null;
	readonly staleCount: number;
}) {
	const { t } = useI18n();
	if (!preview) return null;
	const matched = (preview.samples ?? []).filter((sample) => sample.matched);
	return (
		<section className="vs-preview" aria-live="polite">
			<header className="vs-preview-header">
				<h3>{t("valueStudio.preview.title")}</h3>
				<Badge tone="neutral">{t("valueStudio.preview.previewOnly")}</Badge>
			</header>
			{staleCount > 0 && (
				<p className="vs-stale-note">
					{t("valueStudio.preview.staleDiscarded", { count: staleCount })}
				</p>
			)}
			{matched.length === 0 ? (
				<p className="vs-empty-note">{t("valueStudio.preview.noMatches")}</p>
			) : (
				matched.map((result) => (
					<CanonicalValueView
						key={`${result.input}-${result.recipeId ?? ""}`}
						result={result}
					/>
				))
			)}
			<CandidateRejectionList results={preview.samples ?? []} />
			<p className="vs-preview-meta">
				<span>
					{t("valueStudio.preview.fingerprint")}:{" "}
					<code>{preview.graphFingerprint}</code>
				</span>
			</p>
		</section>
	);
}
