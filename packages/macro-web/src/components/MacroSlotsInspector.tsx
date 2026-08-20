import type {
	EditorDocumentDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { AlertTriangle, Check, Pin, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge } from "./ui/primitives";

export interface MacroSlotsInspectorProps {
	readonly document: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly onPin?: (macroId: string | null) => void;
}

export function MacroSlotsInspector({
	document,
	meta,
	onPin,
}: MacroSlotsInspectorProps) {
	const { t } = useI18n();
	const pinned = meta?.pinnedMacroIds ?? [];

	if (!document) {
		return (
			<section
				className="macro-slots-panel"
				aria-label={t("editor.slots.title")}
			>
				<div className="inspector-section-header">
					<Sparkles size={14} className="section-icon" />
					<span>{t("editor.slots.title")}</span>
				</div>
				<p className="inspector-empty">{t("editor.inactive.description")}</p>
			</section>
		);
	}

	const validSlots = document.lines.filter((l) => l.macroName);
	const diagnostics = document.lines.flatMap((l) =>
		l.diagnostics.map((d) => ({ line: l.lineNumber, ...d })),
	);

	return (
		<section className="macro-slots-panel" aria-label={t("editor.slots.title")}>
			{/* Active Macro Slots Section */}
			<div className="inspector-section">
				<div className="inspector-section-header">
					<Sparkles size={13} className="section-icon" />
					<span>{t("editor.slots.title")}</span>
					<span className="section-count">{validSlots.length}</span>
				</div>

				<div className="inspector-section-body">
					{validSlots.length === 0 ? (
						<div className="inspector-empty-row">
							<span>{t("editor.surface.noProjection")}</span>
						</div>
					) : (
						<div className="macro-slot-rows">
							{validSlots.map((line) => {
								const isPinned = Boolean(
									line.macroName && pinned.includes(line.macroName),
								);
								const availableProjections =
									line.projections?.filter(
										(p) => p.payload.availability === "available",
									) ?? [];

								return (
									<div className="macro-slot-item" key={line.lineNumber}>
										<div className="slot-item-header">
											<span className="slot-line-tag">L{line.lineNumber}</span>
											<strong className="slot-macro-name">
												{line.macroName}
											</strong>
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
												<span>{line.diagnostics[0]?.message}</span>
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
			</div>

			{/* Diagnostics Section */}
			{diagnostics.length > 0 && (
				<div className="inspector-section">
					<div className="inspector-section-header">
						<AlertTriangle size={13} className="section-icon-warn" />
						<span>{t("status.diagnostics")}</span>
						<Badge tone="danger">{diagnostics.length}</Badge>
					</div>
					<div className="inspector-section-body">
						<div className="diagnostic-items-list">
							{diagnostics.map((d, index) => (
								<div className="diagnostic-item" key={`${d.line}-${index}`}>
									<span className="diag-line">L{d.line}</span>
									<span className="diag-msg">{d.message}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
