import type {
	PinnedMacroDto,
	ScratchpadLineDto,
} from "@stateful-mcp/macro-protocol";
import { FileCode2, Layers, Pin, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type { ContributedInspectorView, InspectorTab } from "./inspector-types";

export interface InspectorVerticalStripProps {
	readonly isOpen: boolean;
	readonly activeTab: InspectorTab;
	readonly onTabClick: (tab: InspectorTab) => void;
	readonly diagnosticsCount: number;
	readonly errorCount: number;
	readonly activeLine?: ScratchpadLineDto;
	readonly validSlotsCount: number;
	readonly pinnedMacros: readonly PinnedMacroDto[];
	readonly isTemplateDocument: boolean;
	readonly contributedViews?: readonly ContributedInspectorView[];
}

export function InspectorVerticalStrip({
	isOpen,
	activeTab,
	onTabClick,
	diagnosticsCount,
	errorCount,
	activeLine,
	validSlotsCount,
	pinnedMacros,
	isTemplateDocument,
	contributedViews = [],
}: InspectorVerticalStripProps) {
	const { t } = useI18n();

	return (
		<nav
			className="inspector-vertical-strip"
			aria-label={t("workbench.inspector")}
		>
			{/* 1. Problems Tab */}
			<button
				type="button"
				className={`inspector-strip-btn ${isOpen && activeTab === "problems" ? "active" : ""}`}
				title={`${t("workbench.problems")} (${diagnosticsCount})`}
				onClick={() => onTabClick("problems")}
				aria-label={t("workbench.problems")}
			>
				<ShieldAlert size={18} />
				{diagnosticsCount > 0 && (
					<span
						className={`inspector-strip-badge ${errorCount > 0 ? "danger" : "warning"}`}
					>
						{diagnosticsCount}
					</span>
				)}
			</button>

			{/* 2. Cell Details Tab */}
			<button
				type="button"
				className={`inspector-strip-btn ${isOpen && activeTab === "cell" ? "active" : ""}`}
				title={`${t("workbench.cellDetails")}${activeLine?.macroName ? ` (^${activeLine.macroName})` : ""}`}
				onClick={() => onTabClick("cell")}
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
				title={`${t("workbench.slots")} (${validSlotsCount})`}
				onClick={() => onTabClick("slots")}
				aria-label={t("workbench.slots")}
			>
				<Sparkles size={18} />
				{validSlotsCount > 0 && (
					<span className="inspector-strip-badge neutral">
						{validSlotsCount}
					</span>
				)}
			</button>

			{/* 4. Quick-Runs Tab */}
			<button
				type="button"
				className={`inspector-strip-btn ${isOpen && activeTab === "pinned" ? "active" : ""}`}
				title={`${t("workbench.quickRuns")} (${pinnedMacros.length})`}
				onClick={() => onTabClick("pinned")}
				aria-label={t("workbench.quickRuns")}
			>
				<Pin size={18} />
				{pinnedMacros.length > 0 && (
					<span className="inspector-strip-badge neutral">
						{pinnedMacros.length}
					</span>
				)}
			</button>

			{/* 5. Template Structure Tab — only shown for template documents */}
			{isTemplateDocument && (
				<button
					type="button"
					className={`inspector-strip-btn ${isOpen && activeTab === "template" ? "active" : ""}`}
					title={t("workbench.template.inspector.title")}
					onClick={() => onTabClick("template")}
					aria-label={t("workbench.template.inspector.title")}
				>
					<FileCode2 size={18} />
				</button>
			)}

			{/* Contributed Extension View Buttons */}
			{contributedViews.map((view) => {
				const IconComponent = view.icon;
				return (
					<button
						key={view.id}
						type="button"
						className={`inspector-strip-btn ${isOpen && activeTab === view.id ? "active" : ""}`}
						title={view.name}
						onClick={() => onTabClick(view.id)}
						aria-label={view.name}
					>
						<IconComponent size={18} />
					</button>
				);
			})}

			<div className="inspector-strip-spacer" />
		</nav>
	);
}
