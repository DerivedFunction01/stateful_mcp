import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import { Check, Pin, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type { InspectorDiagnosticItem } from "./inspector-types";
import { resolveDiagnosticMessage } from "./inspector-utils";

export interface InspectorSlotsTabProps {
	readonly validSlots: readonly ScratchpadLineDto[];
	readonly pinnedMacroIds: readonly string[];
	readonly onPin?: (macroId: string | null) => void;
}

export function InspectorSlotsTab({
	validSlots,
	pinnedMacroIds,
	onPin,
}: InspectorSlotsTabProps) {
	const { t } = useI18n();

	return (
		<div className="inspector-tab-content">
			{validSlots.length === 0 ? (
				<div className="inspector-empty-state">
					<Sparkles size={20} />
					<span>{t("workbench.noMacroLines")}</span>
				</div>
			) : (
				<div className="macro-slot-rows">
					{validSlots.map((line) => {
						const isPinned = Boolean(
							line.macroName && pinnedMacroIds.includes(line.macroName),
						);
						const availableProjections =
							line.projections?.filter(
								(p) => p.payload.availability === "available",
							) ?? [];

						return (
							<div className="macro-slot-item" key={line.lineNumber}>
								<div className="slot-item-header">
									<span className="slot-line-tag">L{line.lineNumber}</span>
									<strong className="slot-macro-name">{line.macroName}</strong>
									<button
										type="button"
										className={`slot-pin-toggle ${isPinned ? "pinned" : ""}`}
										title={
											isPinned
												? t("editor.document.pinnedMacro")
												: t("editor.document.pinMacro")
										}
										onClick={() =>
											onPin?.(isPinned ? null : (line.macroName ?? null))
										}
									>
										<Pin size={11} />
									</button>
								</div>

								{line.diagnostics.length > 0 ? (
									<div className="slot-item-diagnostic">
										<ShieldAlert size={11} />
										<span>
											{resolveDiagnosticMessage(
												{
													line: line.lineNumber,
													macroName: line.macroName,
													message: line.diagnostics[0]!.message,
													messageKey: line.diagnostics[0]!.messageKey,
													messageParams: line.diagnostics[0]!.messageParams,
													code: line.diagnostics[0]!.code,
													severity: line.diagnostics[0]!.severity,
												} as InspectorDiagnosticItem,
												t,
											)}
										</span>
									</div>
								) : availableProjections.length > 0 ? (
									<div className="slot-item-projection">
										<Check size={11} />
										<span>
											{t("editor.surface.projectionAvailable")} (
											{availableProjections.length})
										</span>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
