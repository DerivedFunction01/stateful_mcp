import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadLineDto,
	ScratchpadSnapshotDto,
	SidepanelPosition,
} from "@stateful-mcp/macro-protocol";
import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Layers,
	PanelLeftClose,
	PanelRightClose,
	Pin,
	Plus,
	ShieldAlert,
	Sparkles,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button } from "./ui/primitives";

export interface ContributedInspectorView {
	readonly id: string;
	readonly name: string;
	readonly icon: React.ComponentType<{ size?: number; className?: string }>;
	readonly render: () => React.ReactNode;
}

export interface WorkbenchInspectorProps {
	readonly document: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly activeLineIndex?: number;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly isOpen?: boolean;
	readonly onToggleOpen?: () => void;
	readonly dockPosition?: SidepanelPosition;
	readonly onToggleDockPosition?: () => void;
	readonly onPin?: (macroId: string | null) => void;
	readonly onJumpToLine?: (lineNumber: number) => void;
	readonly onInsertSnippet?: (snippet: string) => void;
	readonly contributedViews?: readonly ContributedInspectorView[];
}

export type InspectorTab = "problems" | "cell" | "slots" | "pinned" | string;
export type SeverityFilter = "all" | "error" | "warning";

export function WorkbenchInspector({
	document,
	meta,
	activeLineIndex,
	pinnedMacros = [],
	isOpen = true,
	onToggleOpen,
	dockPosition = "right",
	onToggleDockPosition,
	onPin,
	onJumpToLine,
	onInsertSnippet,
	contributedViews = [],
}: WorkbenchInspectorProps) {
	const { t } = useI18n();
	const [activeTab, setActiveTab] = useState<InspectorTab>("problems");
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

	const pinned = meta?.pinnedMacroIds ?? [];
	const lines = document?.lines ?? [];
	const activeLine: ScratchpadLineDto | undefined =
		activeLineIndex !== undefined && activeLineIndex >= 0
			? lines[activeLineIndex]
			: lines[0];

	// Aggregate diagnostics from all lines
	const allDiagnostics = useMemo(() => {
		return lines.flatMap((line) =>
			line.diagnostics.map((diag) => ({
				line: line.lineNumber,
				macroName: line.macroName,
				...diag,
			})),
		);
	}, [lines]);

	const filteredDiagnostics = useMemo(() => {
		if (severityFilter === "all") return allDiagnostics;
		return allDiagnostics.filter((d) => d.severity === severityFilter);
	}, [allDiagnostics, severityFilter]);

	const errorCount = allDiagnostics.filter(
		(d) => d.severity === "error",
	).length;
	const warnCount = allDiagnostics.filter(
		(d) => d.severity === "warning",
	).length;
	const validSlots = lines.filter((l) => l.macroName);

	const handleTabClick = (tabId: InspectorTab) => {
		if (activeTab === tabId && isOpen) {
			// Re-clicking active tab closes/collapses the panel
			onToggleOpen?.();
		} else {
			setActiveTab(tabId);
			if (!isOpen) {
				onToggleOpen?.();
			}
		}
	};

	const resolveDiagnosticMessage = (d: {
		message: string;
		messageKey?: string;
		messageParams?: Readonly<Record<string, string | number | boolean>>;
		code?: string;
	}) => {
		if (d.messageKey) {
			return t(d.messageKey as any, d.messageParams as any);
		}
		if (d.code) {
			const errorKey = `errors.${d.code}` as any;
			const translated = t(errorKey);
			if (translated && translated !== errorKey) return translated;
		}
		return d.message;
	};

	const activeContributedView = contributedViews.find(
		(v) => v.id === activeTab,
	);

	const activeTabTitle = useMemo(() => {
		switch (activeTab) {
			case "problems":
				return t("workbench.problems");
			case "cell":
				return t("workbench.cellDetails");
			case "slots":
				return t("workbench.slots");
			case "pinned":
				return t("workbench.quickRuns");
			default:
				return activeContributedView?.name ?? t("workbench.inspector");
		}
	}, [activeTab, activeContributedView, t]);

	return (
		<div className={`workbench-inspector-wrapper dock-${dockPosition}`}>
			{/* Vertical Rail Strip (Icons only, never truncates) */}
			<nav
				className="inspector-vertical-strip"
				aria-label={t("workbench.inspector")}
			>
				{/* 1. Problems Tab */}
				<button
					type="button"
					className={`inspector-strip-btn ${isOpen && activeTab === "problems" ? "active" : ""}`}
					title={`${t("workbench.problems")} (${allDiagnostics.length})`}
					onClick={() => handleTabClick("problems")}
					aria-label={t("workbench.problems")}
				>
					<ShieldAlert size={18} />
					{allDiagnostics.length > 0 && (
						<span
							className={`inspector-strip-badge ${errorCount > 0 ? "danger" : "warning"}`}
						>
							{allDiagnostics.length}
						</span>
					)}
				</button>

				{/* 2. Cell Details Tab */}
				<button
					type="button"
					className={`inspector-strip-btn ${isOpen && activeTab === "cell" ? "active" : ""}`}
					title={`${t("workbench.cellDetails")}${activeLine?.macroName ? ` (^${activeLine.macroName})` : ""}`}
					onClick={() => handleTabClick("cell")}
					aria-label={t("workbench.cellDetails")}
				>
					<Layers size={18} />
					{activeLine?.macroName && (
						<span className="inspector-strip-badge neutral">^</span>
					)}
				</button>

				{/* 3. Slots Tab */}
				<button
					type="button"
					className={`inspector-strip-btn ${isOpen && activeTab === "slots" ? "active" : ""}`}
					title={`${t("workbench.slots")} (${validSlots.length})`}
					onClick={() => handleTabClick("slots")}
					aria-label={t("workbench.slots")}
				>
					<Sparkles size={18} />
					{validSlots.length > 0 && (
						<span className="inspector-strip-badge neutral">
							{validSlots.length}
						</span>
					)}
				</button>

				{/* 4. Quick-Runs Tab */}
				<button
					type="button"
					className={`inspector-strip-btn ${isOpen && activeTab === "pinned" ? "active" : ""}`}
					title={`${t("workbench.quickRuns")} (${pinnedMacros.length})`}
					onClick={() => handleTabClick("pinned")}
					aria-label={t("workbench.quickRuns")}
				>
					<Pin size={18} />
					{pinnedMacros.length > 0 && (
						<span className="inspector-strip-badge neutral">
							{pinnedMacros.length}
						</span>
					)}
				</button>

				{/* Contributed Extension View Buttons */}
				{contributedViews.map((view) => {
					const IconComponent = view.icon;
					return (
						<button
							key={view.id}
							type="button"
							className={`inspector-strip-btn ${isOpen && activeTab === view.id ? "active" : ""}`}
							title={view.name}
							onClick={() => handleTabClick(view.id)}
							aria-label={view.name}
						>
							<IconComponent size={18} />
						</button>
					);
				})}

				<div className="inspector-strip-spacer" />

				{/* Dock Position Swap Button */}
				{onToggleDockPosition && (
					<button
						type="button"
						className="inspector-strip-btn"
						title={
							dockPosition === "right"
								? "Move Inspector to Left"
								: "Move Inspector to Right"
						}
						onClick={onToggleDockPosition}
						aria-label="Toggle Dock Position"
					>
						{dockPosition === "right" ? (
							<PanelLeftClose size={17} />
						) : (
							<PanelRightClose size={17} />
						)}
					</button>
				)}

				{/* Close / Collapse Button */}
				{onToggleOpen && (
					<button
						type="button"
						className="inspector-strip-btn"
						title={isOpen ? "Collapse Inspector" : "Expand Inspector"}
						onClick={onToggleOpen}
						aria-label="Toggle Inspector Visibility"
					>
						{isOpen ? (
							dockPosition === "right" ? (
								<ChevronRight size={18} />
							) : (
								<ChevronLeft size={18} />
							)
						) : dockPosition === "right" ? (
							<ChevronLeft size={18} />
						) : (
							<ChevronRight size={18} />
						)}
					</button>
				)}
			</nav>

			{/* Main Inspector Panel Body (Visible when open) */}
			{isOpen && (
				<section className="inspector-main-panel">
					{/* Header bar with title and actions */}
					<header className="inspector-panel-header">
						<div className="inspector-header-title">
							<span>{activeTabTitle}</span>
							{activeTab === "problems" && allDiagnostics.length > 0 && (
								<Badge tone={errorCount > 0 ? "danger" : "warning"}>
									{allDiagnostics.length}
								</Badge>
							)}
						</div>
						<div className="inspector-header-actions">
							{onToggleOpen && (
								<button
									type="button"
									className="icon-button"
									title="Close Inspector"
									onClick={onToggleOpen}
									aria-label="Close Inspector"
								>
									<X size={13} />
								</button>
							)}
						</div>
					</header>

					{/* Tab Body Contents */}
					<div className="inspector-panel-body">
						{/* Tab 1: Problems & Diagnostics */}
						{activeTab === "problems" && (
							<div className="inspector-tab-content">
								{/* High-Contrast Filter Pills */}
								<div className="severity-filter-bar">
									<button
										type="button"
										className={`filter-chip ${severityFilter === "all" ? "active" : ""}`}
										onClick={() => setSeverityFilter("all")}
									>
										<span>
											{t("workbench.filterAll", {
												count: allDiagnostics.length,
											})}
										</span>
									</button>
									<button
										type="button"
										className={`filter-chip severity-error ${severityFilter === "error" ? "active" : ""}`}
										onClick={() => setSeverityFilter("error")}
									>
										<AlertCircle size={11} />
										<span>
											{t("workbench.filterErrors", { count: errorCount })}
										</span>
									</button>
									<button
										type="button"
										className={`filter-chip severity-warning ${severityFilter === "warning" ? "active" : ""}`}
										onClick={() => setSeverityFilter("warning")}
									>
										<AlertTriangle size={11} />
										<span>
											{t("workbench.filterWarnings", { count: warnCount })}
										</span>
									</button>
								</div>

								{filteredDiagnostics.length === 0 ? (
									<div className="inspector-empty-state">
										<CheckCircle2 size={24} className="empty-success-icon" />
										<strong>{t("workbench.noProblems")}</strong>
										<span>{t("workbench.allLinesValid")}</span>
									</div>
								) : (
									<div className="diagnostic-group">
										{filteredDiagnostics.map((d, idx) => (
											<button
												key={`${d.line}-${d.code}-${idx}`}
												type="button"
												className={`diagnostic-card clickable-diag-card severity-${d.severity}`}
												onClick={() => onJumpToLine?.(d.line)}
											>
												<div className="diag-card-header">
													{d.severity === "error" ? (
														<AlertCircle
															size={13}
															className="diag-icon-error"
														/>
													) : (
														<AlertTriangle
															size={13}
															className="diag-icon-warn"
														/>
													)}
													<span className="diag-line-tag">
														{t("editor.execution.line", { line: d.line })}
													</span>
													{d.macroName && (
														<span className="diag-macro-tag">
															^{d.macroName}
														</span>
													)}
													{d.code && (
														<span className="diag-code">{d.code}</span>
													)}
												</div>
												<div className="diag-card-body">
													{resolveDiagnosticMessage(d)}
												</div>
											</button>
										))}
									</div>
								)}
							</div>
						)}

						{/* Tab 2: Active Cell & Sub-Order Inspector */}
						{activeTab === "cell" && (
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
										{activeLine.projections &&
											activeLine.projections.length > 0 && (
												<div className="suborder-flow-badge">
													<div className="suborder-title">
														{t("workbench.boundProjections")}
													</div>
													<div className="suborder-tokens">
														{activeLine.projections.map((p, idx) => (
															<span
																className="token-chip"
																key={`${p.payload.kind}-${idx}`}
															>
																{p.payload.kind}
															</span>
														))}
													</div>
												</div>
											)}

										{/* Live Projections Inspection */}
										{activeLine.projections &&
											activeLine.projections.length > 0 && (
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
						)}

						{/* Tab 3: Slots Overview */}
						{activeTab === "slots" && (
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
												line.macroName && pinned.includes(line.macroName),
											);
											const availableProjections =
												line.projections?.filter(
													(p) => p.payload.availability === "available",
												) ?? [];

											return (
												<div className="macro-slot-item" key={line.lineNumber}>
													<div className="slot-item-header">
														<span className="slot-line-tag">
															L{line.lineNumber}
														</span>
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
																onPin?.(
																	isPinned ? null : (line.macroName ?? null),
																)
															}
														>
															<Pin size={11} />
														</button>
													</div>

													{line.diagnostics.length > 0 ? (
														<div className="slot-item-diagnostic">
															<ShieldAlert size={11} />
															<span>
																{resolveDiagnosticMessage(line.diagnostics[0]!)}
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
						)}

						{/* Tab 4: Quick-Runs & Pinned Macros */}
						{activeTab === "pinned" && (
							<div className="inspector-tab-content">
								<div className="pinned-macros-list">
									<div className="suborder-title">
										{t("workbench.availableQuickRuns")}
									</div>
									{pinnedMacros.length === 0 ? (
										<div className="inspector-empty-state">
											<Pin size={20} />
											<span>{t("workbench.noPinnedMacros")}</span>
										</div>
									) : (
										pinnedMacros.map((macro) => (
											<div className="pinned-macro-card" key={macro.id}>
												<div className="pinned-card-title">
													<div
														style={{
															display: "flex",
															gap: 6,
															alignItems: "center",
														}}
													>
														<Badge
															tone={
																macro.source === "project"
																	? "accent"
																	: macro.source === "frequent"
																		? "info"
																		: "neutral"
															}
														>
															{macro.source}
														</Badge>
														<strong>^{macro.macroName}</strong>
													</div>
													{macro.snippet && (
														<Button
															variant="ghost"
															icon={<Plus size={11} />}
															onClick={() => onInsertSnippet?.(macro.snippet!)}
														>
															{t("workbench.insertSnippet")}
														</Button>
													)}
												</div>
												{macro.executionCount !== undefined &&
													macro.executionCount > 0 && (
														<span className="pinned-card-desc">
															{t("workbench.executedCount", {
																count: macro.executionCount,
															})}
														</span>
													)}
											</div>
										))
									)}
								</div>
							</div>
						)}

						{/* Contributed View Content */}
						{activeContributedView && (
							<div className="inspector-tab-content">
								{activeContributedView.render()}
							</div>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
