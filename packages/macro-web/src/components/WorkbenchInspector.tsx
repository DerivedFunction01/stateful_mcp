import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadLineDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	Layers,
	Pin,
	Plus,
	ShieldAlert,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button } from "./ui/primitives";

export interface WorkbenchInspectorProps {
	readonly document: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly activeLineIndex?: number;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly onPin?: (macroId: string | null) => void;
	readonly onJumpToLine?: (lineNumber: number) => void;
	readonly onInsertSnippet?: (snippet: string) => void;
}

export type InspectorTab = "problems" | "cell" | "slots" | "pinned";
export type SeverityFilter = "all" | "error" | "warning" | "info";

export function WorkbenchInspector({
	document,
	meta,
	activeLineIndex,
	pinnedMacros = [],
	onPin,
	onJumpToLine,
	onInsertSnippet,
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

	if (!document) {
		return (
			<section
				className="workbench-inspector-panel"
				aria-label={t("workbench.inspector")}
			>
				<div className="inspector-tabs-nav">
					<span className="inspector-nav-tab active">
						<Sparkles size={13} />
						<span>{t("workbench.inspector")}</span>
					</span>
				</div>
				<p className="inspector-empty-state">
					{t("editor.inactive.description")}
				</p>
			</section>
		);
	}

	return (
		<section
			className="workbench-inspector-panel"
			aria-label={t("workbench.inspector")}
		>
			{/* Inspector Tab Bar */}
			<div className="inspector-tabs-nav" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "problems"}
					className={`inspector-nav-tab ${activeTab === "problems" ? "active" : ""}`}
					onClick={() => setActiveTab("problems")}
				>
					<ShieldAlert size={13} />
					<span>{t("workbench.problems")}</span>
					{allDiagnostics.length > 0 ? (
						<Badge tone={errorCount > 0 ? "danger" : "warning"}>
							{allDiagnostics.length}
						</Badge>
					) : (
						<span className="tab-count">0</span>
					)}
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "cell"}
					className={`inspector-nav-tab ${activeTab === "cell" ? "active" : ""}`}
					onClick={() => setActiveTab("cell")}
				>
					<Layers size={13} />
					<span>{t("workbench.cellDetails")}</span>
					{activeLine?.macroName && (
						<Badge tone="accent">{activeLine.macroName}</Badge>
					)}
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "slots"}
					className={`inspector-nav-tab ${activeTab === "slots" ? "active" : ""}`}
					onClick={() => setActiveTab("slots")}
				>
					<Sparkles size={13} />
					<span>{t("workbench.slots")}</span>
					<span className="tab-count">{validSlots.length}</span>
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "pinned"}
					className={`inspector-nav-tab ${activeTab === "pinned" ? "active" : ""}`}
					onClick={() => setActiveTab("pinned")}
				>
					<Pin size={13} />
					<span>{t("workbench.quickRuns")}</span>
					{pinnedMacros.length > 0 && (
						<span className="tab-count">{pinnedMacros.length}</span>
					)}
				</button>
			</div>

			{/* Inspector Tab Body */}
			<div className="inspector-panel-body">
				{/* Tab 1: Problems & Diagnostics */}
				{activeTab === "problems" && (
					<div className="inspector-tab-content">
						<div className="severity-filter-bar">
							<button
								type="button"
								className={`filter-chip ${severityFilter === "all" ? "active" : ""}`}
								onClick={() => setSeverityFilter("all")}
							>
								{t("workbench.filterAll", {
									count: allDiagnostics.length,
								})}
							</button>
							<button
								type="button"
								className={`filter-chip ${severityFilter === "error" ? "active" : ""}`}
								onClick={() => setSeverityFilter("error")}
							>
								{t("workbench.filterErrors", {
									count: errorCount,
								})}
							</button>
							<button
								type="button"
								className={`filter-chip ${severityFilter === "warning" ? "active" : ""}`}
								onClick={() => setSeverityFilter("warning")}
							>
								{t("workbench.filterWarnings", {
									count: warnCount,
								})}
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
												<AlertCircle size={13} className="diag-icon-error" />
											) : (
												<AlertTriangle size={13} className="diag-icon-warn" />
											)}
											<span className="diag-line-tag">
												{t("editor.execution.line", {
													line: d.line,
												})}
											</span>
											{d.macroName && (
												<span className="diag-macro-tag">^{d.macroName}</span>
											)}
											{d.code && <span className="diag-code">{d.code}</span>}
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
			</div>
		</section>
	);
}
