import type {
	EditorOperationResult,
	EditorOutputSnapshotDto,
	ScratchpadLineStatus,
} from "@stateful-mcp/macro-protocol";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	Eye,
	PanelBottom,
	RotateCcw,
	XCircle,
} from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge } from "./ui/primitives";

export interface EditorOutputDrawerProps {
	readonly output?: EditorOutputSnapshotDto;
	readonly result?: EditorOperationResult;
	readonly defaultOpen?: boolean;
	readonly isOpen?: boolean;
	readonly onToggleOpen?: () => void;
	readonly onReverseEntry?: (entryId: string) => void | Promise<void>;
}

type OutputTab = "output" | "preview" | "receipts" | "skipped";

export function EditorOutputDrawer({
	output,
	result,
	defaultOpen = true,
	isOpen: controlledOpen,
	onToggleOpen,
	onReverseEntry,
}: EditorOutputDrawerProps) {
	const { t } = useI18n();
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isOpen = controlledOpen ?? internalOpen;
	const setIsOpen = onToggleOpen ?? (() => setInternalOpen((open) => !open));
	const openDrawer = () => {
		if (isOpen) return;
		if (onToggleOpen) onToggleOpen();
		else setInternalOpen(true);
	};
	const [activeTab, setActiveTab] = useState<OutputTab>("output");
	const [height, setHeight] = useState(180);
	const resizeStart = useRef<{ y: number; height: number } | null>(null);

	const handleResizePointerDown = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		resizeStart.current = { y: event.clientY, height };
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const handleResizePointerMove = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (!resizeStart.current) return;
		setHeight(
			Math.max(
				120,
				Math.min(
					600,
					resizeStart.current.height - (event.clientY - resizeStart.current.y),
				),
			),
		);
	};
	const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		resizeStart.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
	};

	const receipts =
		result && "receipts" in result ? (result.receipts ?? []) : [];
	const skippedLines =
		result && "skippedLines" in result ? (result.skippedLines ?? []) : [];
	const previewLines = result?.status === "preview" ? (result.lines ?? []) : [];

	const hasReceipts = receipts.length > 0;
	const hasSkipped = skippedLines.length > 0;
	const hasPreview = previewLines.length > 0;
	const entries = output?.entries ?? [];

	const lineStatusLabel = (status: ScratchpadLineStatus) =>
		t(`editor.lineStatus.${status === "non-macro" ? "nonMacro" : status}`);

	return (
		<section
			className={`editor-output-drawer ${isOpen ? "open" : "collapsed"}`}
			style={{ "--output-drawer-height": `${height}px` } as CSSProperties}
			aria-label={t("editor.output.title")}
		>
			{isOpen && (
				// biome-ignore lint/a11y/useSemanticElements: interactive window splitter widget requires div with role=separator
				<div
					className="output-drawer-resizer"
					role="separator"
					aria-orientation="horizontal"
					aria-label={t("workbench.resizeOutputDrawer")}
					aria-valuenow={height}
					aria-valuemin={120}
					aria-valuemax={600}
					tabIndex={0}
					onPointerDown={handleResizePointerDown}
					onPointerMove={handleResizePointerMove}
					onPointerUp={handleResizePointerUp}
				/>
			)}
			<header className="output-drawer-header">
				<div className="output-drawer-tabs">
					<button
						type="button"
						className={`drawer-tab-btn ${activeTab === "output" ? "active" : ""}`}
						onClick={() => {
							setActiveTab("output");
							openDrawer();
						}}
					>
						<PanelBottom size={13} />
						<span>{t("editor.output.title")}</span>
						{entries.length > 0 && (
							<span className="drawer-tab-count">{entries.length}</span>
						)}
					</button>

					{hasReceipts && (
						<button
							type="button"
							className={`drawer-tab-btn ${activeTab === "receipts" ? "active" : ""}`}
							onClick={() => {
								setActiveTab("receipts");
								openDrawer();
							}}
						>
							<CheckCircle2 size={13} />
							<span>{t("editor.execution.result")}</span>
							<span className="drawer-tab-count">{receipts.length}</span>
						</button>
					)}

					{hasPreview && (
						<button
							type="button"
							className={`drawer-tab-btn ${activeTab === "preview" ? "active" : ""}`}
							onClick={() => {
								setActiveTab("preview");
								openDrawer();
							}}
						>
							<Eye size={13} />
							<span>{t("editor.preview.title")}</span>
						</button>
					)}

					{hasSkipped && (
						<button
							type="button"
							className={`drawer-tab-btn ${activeTab === "skipped" ? "active" : ""}`}
							onClick={() => {
								setActiveTab("skipped");
								openDrawer();
							}}
						>
							<AlertTriangle size={13} />
							<span>{t("editor.execution.skipped")}</span>
							<span className="drawer-tab-count">{skippedLines.length}</span>
						</button>
					)}
				</div>

				<div className="output-drawer-actions">
					<button
						type="button"
						className="drawer-toggle-btn"
						onClick={() =>
							onToggleOpen ? onToggleOpen() : setInternalOpen(!isOpen)
						}
						title={t(isOpen ? "menu.toggleSidepanel" : "menu.toggleSidepanel")}
						aria-label={t("menu.toggleSidepanel")}
					>
						{isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
					</button>
				</div>
			</header>

			{isOpen && (
				<div className="output-drawer-body">
					{/* Output / Log Entries */}
					{activeTab === "output" && (
						<div className="output-tab-content">
							{entries.length === 0 ? (
								<div className="output-empty-state">
									<Clock size={16} />
									<span>{t("editor.output.empty")}</span>
								</div>
							) : (
								<div className="output-entries-list">
									{entries.map((entry) => (
										<div
											className={`output-entry-row output-${entry.status}`}
											key={entry.outputId}
										>
											<div className="entry-status-badge">
												{entry.status === "committed" ? (
													<CheckCircle2
														size={12}
														className="status-icon-success"
													/>
												) : entry.status === "failed" ? (
													<XCircle size={12} className="status-icon-error" />
												) : (
													<AlertTriangle
														size={12}
														className="status-icon-warn"
													/>
												)}
												<span className="entry-status-name">
													{t(`editor.output.${entry.status}`)}
												</span>
											</div>

											{entry.lineNumber && (
												<span className="entry-line-num">
													L{entry.lineNumber}
												</span>
											)}

											{entry.errorCode && (
												<Badge tone="danger">{entry.errorCode}</Badge>
											)}

											{entry.identity && (
												<span className="entry-identity">
													{entry.identity.documentId} (r
													{entry.identity.textRevision})
												</span>
											)}

											{entry.status === "committed" && onReverseEntry && (
												<button
													type="button"
													className="entry-reversal-btn"
													title={t("editor.undo.reverse")}
													onClick={() => onReverseEntry(entry.outputId)}
												>
													<RotateCcw size={11} />
													<span>{t("editor.undo.reverse")}</span>
												</button>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Execution Receipts Tab */}
					{activeTab === "receipts" && hasReceipts && (
						<div className="output-tab-content">
							<div className="receipts-list">
								{receipts.map((receipt) => (
									<div
										className="receipt-row"
										key={`${receipt.requestId}:${receipt.lineNumber}`}
									>
										<span className="receipt-line">L{receipt.lineNumber}</span>
										<strong className="receipt-macro">
											{receipt.macroId}
										</strong>
										{receipt.invokedAs && (
											<span className="receipt-invoked">
												(^{receipt.invokedAs})
											</span>
										)}
										<span className="receipt-outcome">
											{receipt.success ? (
												<Badge tone="success">
													{t("editor.execution.succeeded")}
												</Badge>
											) : (
												<Badge tone="danger">
													{t("editor.execution.failed")}
												</Badge>
											)}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Preview Tab */}
					{activeTab === "preview" && hasPreview && (
						<div className="output-tab-content">
							<div className="preview-lines-list">
								{previewLines.map((line) => (
									<div className="preview-line-row" key={line.lineNumber}>
										<span className="preview-line-num">{line.lineNumber}:</span>
										<span className="preview-line-content">
											{line.preview?.text ?? line.rawText}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Skipped Tab */}
					{activeTab === "skipped" && hasSkipped && (
						<div className="output-tab-content">
							<div className="skipped-lines-list">
								{skippedLines.map((line) => (
									<div
										className="skipped-line-row"
										key={`skipped:${line.lineNumber}`}
									>
										<span className="skipped-line-num">L{line.lineNumber}</span>
										<span className="skipped-reason">
											{lineStatusLabel(line.lineStatus)}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
