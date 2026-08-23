import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import { Layers } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";

export interface InspectorCellDetailsTabProps {
	readonly activeLine?: ScratchpadLineDto;
}

export function InspectorCellDetailsTab({
	activeLine,
}: InspectorCellDetailsTabProps) {
	const { t } = useI18n();

	return (
		<div className="inspector-tab-content">
			{activeLine ? (
				<div className="cell-details-container">
					<div className="cell-meta-header">
						<div className="cell-title-row">
							<span className="slot-line-tag">
								{t("editor.execution.line", {
									line: activeLine.lineNumber,
								})}
							</span>
							<strong className="cell-macro-title">
								{activeLine.macroName
									? `^${activeLine.macroName}`
									: t("editor.lineStatus.nonMacro")}
							</strong>
							<Badge
								tone={
									activeLine.lineStatus === "valid"
										? "success"
										: activeLine.lineStatus === "invalid"
											? "danger"
											: "info"
								}
							>
								{t(
									`editor.lineStatus.${activeLine.lineStatus === "non-macro" ? "nonMacro" : activeLine.lineStatus}` as any,
								)}
							</Badge>
						</div>
						<div className="cell-raw-preview">
							{activeLine.rawText || "<empty line>"}
						</div>
					</div>

					{/* Sub-Ordered Flow & Token Chips (Islands of Order) */}
					{activeLine.projections && activeLine.projections.length > 0 && (
						<div className="suborder-flow-badge">
							<div className="suborder-title">
								{t("workbench.boundProjections")}
							</div>
							<div className="suborder-tokens">
								{activeLine.projections.map((p, idx) => (
									<span className="token-chip" key={`${p.payload.kind}-${idx}`}>
										{p.payload.kind}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Live Projections Inspection */}
					{activeLine.projections && activeLine.projections.length > 0 && (
						<div className="cell-projections-list">
							<div className="suborder-title">
								{t("workbench.payloadEnvelopes")}
							</div>
							{activeLine.projections.map((proj, index) => (
								<div className="projection-item" key={index}>
									<div className="proj-header">
										<Badge tone="info">{proj.payload.kind}</Badge>
										<span className="proj-avail">
											{proj.payload.availability}
										</span>
									</div>
									{proj.payload.data !== undefined && (
										<pre className="proj-json">
											{JSON.stringify(proj.payload.data, null, 2)}
										</pre>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			) : (
				<div className="inspector-empty-state">
					<Layers size={20} />
					<span>{t("workbench.noActiveLine")}</span>
				</div>
			)}
		</div>
	);
}
