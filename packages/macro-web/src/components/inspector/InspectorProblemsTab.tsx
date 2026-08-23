import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type {
	InspectorDiagnosticItem,
	SeverityFilter,
} from "./inspector-types";
import { resolveDiagnosticMessage } from "./inspector-utils";

export interface InspectorProblemsTabProps {
	readonly diagnostics: readonly InspectorDiagnosticItem[];
	readonly onJumpToLine?: (lineNumber: number) => void;
}

export function InspectorProblemsTab({
	diagnostics,
	onJumpToLine,
}: InspectorProblemsTabProps) {
	const { t } = useI18n();
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

	const filteredDiagnostics = useMemo(() => {
		if (severityFilter === "all") return diagnostics;
		return diagnostics.filter((d) => d.severity === severityFilter);
	}, [diagnostics, severityFilter]);

	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warnCount = diagnostics.filter((d) => d.severity === "warning").length;

	return (
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
							count: diagnostics.length,
						})}
					</span>
				</button>
				<button
					type="button"
					className={`filter-chip severity-error ${severityFilter === "error" ? "active" : ""}`}
					onClick={() => setSeverityFilter("error")}
				>
					<AlertCircle size={11} />
					<span>{t("workbench.filterErrors", { count: errorCount })}</span>
				</button>
				<button
					type="button"
					className={`filter-chip severity-warning ${severityFilter === "warning" ? "active" : ""}`}
					onClick={() => setSeverityFilter("warning")}
				>
					<AlertTriangle size={11} />
					<span>{t("workbench.filterWarnings", { count: warnCount })}</span>
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
									{t("editor.execution.line", { line: d.line })}
								</span>
								{d.macroName && (
									<span className="diag-macro-tag">^{d.macroName}</span>
								)}
								{d.code && <span className="diag-code">{d.code}</span>}
							</div>
							<div className="diag-card-body">
								{resolveDiagnosticMessage(d, t)}
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
