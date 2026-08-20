import type {
	EditorDocumentDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { Pin, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "../lib/macro-i18n-provider";

export function MacroSlotsInspector({
	document,
	meta,
	onPin,
}: {
	readonly document: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly onPin?: (macroId: string | null) => void;
}) {
	const { t } = useI18n();
	const pinned = meta?.pinnedMacroIds ?? [];
	return (
		<section className="macro-slots-panel" aria-label={t("editor.slots.title")}>
			<header className="panel-section-heading">
				<span>
					<Sparkles size={14} /> {t("editor.slots.title")}
				</span>
				<small>{meta?.title ?? t("editor.inactive.title")}</small>
			</header>
			{!document ? (
				<p className="panel-empty">{t("editor.inactive.description")}</p>
			) : (
				<div className="macro-slot-list">
					{document.lines.map((line) => {
						const isPinned = Boolean(
							line.macroName && pinned.includes(line.macroName),
						);
						const available =
							line.projections?.filter(
								(projection) => projection.payload.availability === "available",
							) ?? [];
						return (
							<div className="macro-slot-row" key={line.lineNumber}>
								<div className="macro-slot-row-heading">
									<span className="macro-slot-line-number">
										{line.lineNumber}
									</span>
									<strong>
										{line.macroName ??
											t(
												`editor.lineStatus.${line.lineStatus === "non-macro" ? "nonMacro" : line.lineStatus}`,
											)}
									</strong>
									{line.macroName && (
										<button
											type="button"
											className={isPinned ? "slot-pin active" : "slot-pin"}
											aria-label={
												isPinned
													? t("editor.document.pinnedMacro")
													: t("editor.document.pinMacro")
											}
											onClick={() => onPin?.(isPinned ? null : line.macroName!)}
										>
											<Pin size={12} />
										</button>
									)}
								</div>
								{line.diagnostics.length > 0 ? (
									<div className="slot-diagnostic">
										<ShieldAlert size={12} /> {line.diagnostics[0]!.message}
									</div>
								) : available.length > 0 ? (
									<div className="slot-projection">
										{t("editor.surface.projectionAvailable")} ·{" "}
										{available.length}
									</div>
								) : (
									<div className="slot-muted">
										{t("editor.surface.noProjection")}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
