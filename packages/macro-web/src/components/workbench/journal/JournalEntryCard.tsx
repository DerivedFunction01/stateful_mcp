import {
	AlertCircle,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Copy,
	CornerDownLeft,
	RotateCcw,
	XCircle,
} from "lucide-react";
import type {
	EditorOutputEntryDto,
	GatedActionDescriptorDto,
	MacroArtifactDescriptorDto,
} from "@stateful-mcp/macro-protocol";
import {
	getArtifacts,
	getFacets,
	getGatedActions,
	getJournalPayload,
} from "./journal-utils";
import type { DensityMode, I18nFn } from "./journal-types";
import { JournalFacetStack } from "./JournalFacetStack";
import { JournalArtifactList } from "./JournalArtifactList";
import { JournalGatedActionList } from "./JournalGatedActionList";

export type JournalEntryCardProps = {
	readonly entry: EditorOutputEntryDto;
	readonly idx: number;
	readonly density: DensityMode;
	readonly isSelected: boolean;
	readonly copiedKey: string | null;
	readonly t: I18nFn;
	readonly onSelect: () => void;
	readonly onKeyDown: (e: React.KeyboardEvent) => void;
	readonly onCopy: (text: string, key: string) => void;
	readonly onReplay: () => void;
	readonly onRevert: () => void;
	readonly onInsertFacet: (text: string) => void;
	readonly onSaveArtifact: (artifact: MacroArtifactDescriptorDto) => void;
	readonly onTriggerAction: (action: GatedActionDescriptorDto) => void;
};

export function JournalEntryCard({
	entry,
	idx,
	density,
	isSelected,
	copiedKey,
	t,
	onSelect,
	onKeyDown,
	onCopy,
	onReplay,
	onRevert,
	onInsertFacet,
	onSaveArtifact,
	onTriggerAction,
}: JournalEntryCardProps) {
	const shortHash = entry.fingerprint
		? entry.fingerprint.slice(0, 6)
		: entry.outputId.slice(-6);

	const formattedTime = new Date(entry.executedAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const payload = getJournalPayload(entry);
	const facets = getFacets(payload);
	const artifacts = getArtifacts(payload);
	const gatedActions = getGatedActions(payload);

	return (
		<div
			role="listitem"
			className={`journal-entry-card ${density} ${isSelected ? "selected" : ""} status-${entry.status}`}
			onClick={onSelect}
			onKeyDown={onKeyDown}
		>
			<div className="journal-entry-header">
				<div className="journal-entry-status-node">
					{entry.status === "committed" && (
						<span title={t("journal.filter.committed")}>
							<CheckCircle2 size={13} className="status-glyph committed" />
						</span>
					)}
					{entry.status === "reversed" && (
						<span title={t("journal.filter.reversed")}>
							<RotateCcw size={13} className="status-glyph reversed" />
						</span>
					)}
					{entry.status === "failed" && (
						<span title={t("journal.filter.failed")}>
							<XCircle size={13} className="status-glyph failed" />
						</span>
					)}
				</div>

				<span className="journal-entry-hash">#{shortHash}</span>

				<div className="journal-entry-macro-group">
					<strong className="journal-entry-macro">
						{entry.macroId || t("journal.entry.unnamed")}
					</strong>
					{entry.invokedAs && (
						<span className="journal-entry-trigger">
							({t("journal.entry.via", { trigger: entry.invokedAs })})
						</span>
					)}
				</div>

				{entry.lineNumber !== undefined && (
					<span className="journal-entry-line">L{entry.lineNumber}</span>
				)}

				<span className="journal-entry-time">{formattedTime}</span>

				<div className="journal-entry-chevron">
					{isSelected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</div>
			</div>

			{density === "detailed" && !isSelected && (
				<div className="journal-entry-body-preview">
					{entry.rawText && (
						<code className="journal-raw-preview">{entry.rawText}</code>
					)}
					{entry.reversalReason && (
						<div className="journal-reversal-badge">
							<RotateCcw size={11} />
							<span>{entry.reversalReason}</span>
						</div>
					)}
				</div>
			)}

			{isSelected && (
				<div
					className="journal-entry-inspector"
					onClick={(e) => e.stopPropagation()}
				>
					{entry.rawText && (
						<div className="inspector-section">
							<div className="inspector-section-header">
								<span className="inspector-label">
									{t("journal.entry.line", {
										line: String(entry.lineNumber ?? 1),
									})}
								</span>
								<button
									type="button"
									className="inspector-mini-btn"
									title={t("journal.action.copyRaw")}
									onClick={() =>
										onCopy(entry.rawText!, `${entry.outputId}:raw`)
									}
								>
									{copiedKey === `${entry.outputId}:raw` ? (
										<Check size={11} />
									) : (
										<Copy size={11} />
									)}
								</button>
							</div>
							<code className="inspector-raw-text">{entry.rawText}</code>
						</div>
					)}

					{entry.reversalReason && (
						<div className="inspector-section reversal-alert">
							<AlertCircle size={14} />
							<span>
								{t("journal.entry.reversalReason", {
									reason: entry.reversalReason,
								})}
							</span>
						</div>
					)}

					{facets ? (
						<JournalFacetStack
							entryId={entry.outputId}
							facets={facets}
							copiedKey={copiedKey}
							t={t}
							onCopy={onCopy}
							onInsertFacet={onInsertFacet}
						/>
					) : payload ? (
						<div className="inspector-section">
							<div className="inspector-section-header">
								<span className="inspector-label">
									{t("journal.facet.data")}
								</span>
								<button
									type="button"
									className="inspector-mini-btn"
									title={t("journal.action.copyJson")}
									onClick={() =>
										onCopy(
											JSON.stringify(payload, null, 2),
											`${entry.outputId}:json`,
										)
									}
								>
									{copiedKey === `${entry.outputId}:json` ? (
										<Check size={11} />
									) : (
										<Copy size={11} />
									)}
								</button>
							</div>
							<pre className="inspector-json-block">
								{JSON.stringify(payload, null, 2)}
							</pre>
						</div>
					) : null}

					{artifacts && artifacts.length > 0 && (
						<JournalArtifactList
							artifacts={artifacts}
							t={t}
							onSaveArtifact={onSaveArtifact}
						/>
					)}

					{gatedActions && gatedActions.length > 0 && (
						<JournalGatedActionList
							actions={gatedActions}
							t={t}
							onTriggerAction={onTriggerAction}
						/>
					)}

					{entry.fingerprint && (
						<div className="inspector-fingerprint-row">
							<span className="inspector-label">
								{t("journal.entry.fingerprint")}
							</span>
							<code className="inspector-fingerprint" title={entry.fingerprint}>
								{entry.fingerprint}
							</code>
						</div>
					)}

					<div className="inspector-actions">
						<button
							type="button"
							className="inspector-action-btn primary"
							onClick={onReplay}
							title={t("journal.action.replay")}
						>
							<CornerDownLeft size={13} />
							<span>{t("journal.action.replay")}</span>
						</button>

						{entry.status === "committed" && (
							<button
								type="button"
								className="inspector-action-btn danger"
								onClick={onRevert}
								title={t("journal.action.revert")}
							>
								<RotateCcw size={13} />
								<span>{t("journal.action.revert")}</span>
							</button>
						)}

						<button
							type="button"
							className="inspector-action-btn secondary"
							onClick={() =>
								onCopy(
									JSON.stringify(entry, null, 2),
									`${entry.outputId}:receipt`,
								)
							}
							title={t("journal.action.copy")}
						>
							{copiedKey === `${entry.outputId}:receipt` ? (
								<Check size={13} className="copied-icon" />
							) : (
								<Copy size={13} />
							)}
							<span>
								{copiedKey === `${entry.outputId}:receipt`
									? t("journal.action.copied")
									: t("journal.action.copy")}
							</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
