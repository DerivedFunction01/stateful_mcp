import { Check, Copy, CornerDownLeft } from "lucide-react";
import type { MacroDisplayFacetsDto } from "@stateful-mcp/macro-protocol";
import type { I18nFn } from "./journal-types";

export type JournalFacetStackProps = {
	readonly entryId: string;
	readonly facets: MacroDisplayFacetsDto;
	readonly copiedKey: string | null;
	readonly t: I18nFn;
	readonly onCopy: (text: string, key: string) => void;
	readonly onInsertFacet: (text: string) => void;
};

export function JournalFacetStack({
	entryId,
	facets,
	copiedKey,
	t,
	onCopy,
	onInsertFacet,
}: JournalFacetStackProps) {
	return (
		<div className="journal-facet-stack">
			{facets.text && (
				<div className="inspector-section">
					<div className="inspector-section-header">
						<span className="inspector-label">{t("journal.facet.text")}</span>
						<div className="inspector-section-actions">
							<button
								type="button"
								className="inspector-mini-btn"
								title={t("journal.action.replay")}
								onClick={() => onInsertFacet(facets.text!)}
							>
								<CornerDownLeft size={11} />
							</button>
							<button
								type="button"
								className="inspector-mini-btn"
								title={t("journal.action.copyText")}
								onClick={() => onCopy(facets.text!, `${entryId}:prose`)}
							>
								{copiedKey === `${entryId}:prose` ? (
									<Check size={11} />
								) : (
									<Copy size={11} />
								)}
							</button>
						</div>
					</div>
					<div className="inspector-prose-block">{facets.text}</div>
				</div>
			)}

			{facets.data && (
				<div className="inspector-section">
					<div className="inspector-section-header">
						<span className="inspector-label">{t("journal.facet.data")}</span>
						<button
							type="button"
							className="inspector-mini-btn"
							title={t("journal.action.copyJson")}
							onClick={() =>
								onCopy(
									JSON.stringify(facets.data, null, 2),
									`${entryId}:facet_json`,
								)
							}
						>
							{copiedKey === `${entryId}:facet_json` ? (
								<Check size={11} />
							) : (
								<Copy size={11} />
							)}
						</button>
					</div>
					<pre className="inspector-json-block">
						{JSON.stringify(facets.data, null, 2)}
					</pre>
				</div>
			)}

			{facets.table && (
				<div className="inspector-section">
					<span className="inspector-label">{t("journal.facet.table")}</span>
					<div className="inspector-table-wrap">
						<table className="inspector-table">
							<thead>
								<tr>
									{facets.table.headers.map((h, i) => (
										<th key={`${h}_${i}`}>{h}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{facets.table.rows.map((row, ri) => (
									<tr key={`row_${ri}`}>
										{row.map((cell, ci) => (
											<td key={`cell_${ri}_${ci}`}>{String(cell ?? "")}</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
