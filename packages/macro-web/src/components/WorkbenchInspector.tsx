import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import { useMemo, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { InspectorCellDetailsTab } from "./inspector/InspectorCellDetailsTab";
import { InspectorProblemsTab } from "./inspector/InspectorProblemsTab";
import { InspectorQuickRunsTab } from "./inspector/InspectorQuickRunsTab";
import { InspectorSlotsTab } from "./inspector/InspectorSlotsTab";
import { InspectorTemplateTab } from "./inspector/InspectorTemplateTab";
import { InspectorVerticalStrip } from "./inspector/InspectorVerticalStrip";
import type {
	ContributedInspectorView,
	InspectorDiagnosticItem,
	InspectorTab,
	SeverityFilter,
	WorkbenchInspectorProps,
} from "./inspector/inspector-types";
import { Badge, Button } from "./ui/primitives";

// Re-export public types for backwards compatibility with existing consumers
export type {
	ContributedInspectorView,
	InspectorTab,
	SeverityFilter,
	WorkbenchInspectorProps,
};

export function WorkbenchInspector({
	document,
	meta,
	activeLineIndex,
	pinnedMacros = [],
	isOpen = true,
	onToggleOpen,
	dockPosition = "right",
	onToggleDockPosition: _onToggleDockPosition,
	onSetCellDefault,
	onJumpToLine,
	onInsertSnippet,
	onOpenTemplatePicker,
	contributedViews = [],
	activeTemplateDescriptor = null,
	onToggleTemplateLiteralArg,
	onEditTemplateMetadata,
}: WorkbenchInspectorProps) {
	const { t } = useI18n();
	const [activeTab, setActiveTab] = useState<InspectorTab>("problems");

	const lines = document?.lines ?? [];
	const activeLine: ScratchpadLineDto | undefined =
		activeLineIndex !== undefined && activeLineIndex >= 0
			? lines[activeLineIndex]
			: lines[0];

	// Aggregate diagnostics from all lines
	const allDiagnostics = useMemo(() => {
		return lines.flatMap((line) =>
			line.diagnostics.map(
				(diag) =>
					({
						line: line.lineNumber,
						macroName: line.macroName,
						...diag,
					}) as InspectorDiagnosticItem,
			),
		);
	}, [lines]);

	const errorCount = allDiagnostics.filter(
		(d) => d.severity === "error",
	).length;
	const validSlots = lines.filter((l) => l.macroName);
	const isTemplateDocument = meta?.providerId === "macro.template";

	const handleTabClick = (tabId: InspectorTab) => {
		if (activeTab === tabId && isOpen) {
			onToggleOpen?.();
		} else {
			setActiveTab(tabId);
			if (!isOpen) {
				onToggleOpen?.();
			}
		}
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
			case "template":
				return t("templates.inspector.title");
			default:
				return activeContributedView?.name ?? t("workbench.inspector");
		}
	}, [activeTab, activeContributedView, t]);

	return (
		<div className={`workbench-inspector-wrapper dock-${dockPosition}`}>
			{/* Vertical Rail Strip */}
			<InspectorVerticalStrip
				isOpen={isOpen}
				activeTab={activeTab}
				onTabClick={handleTabClick}
				diagnosticsCount={allDiagnostics.length}
				errorCount={errorCount}
				activeLine={activeLine}
				validSlotsCount={validSlots.length}
				pinnedMacros={pinnedMacros}
				isTemplateDocument={isTemplateDocument}
				contributedViews={contributedViews}
			/>

			{/* Main Inspector Panel Body (Visible when open) */}
			{isOpen && (
				<section className="inspector-main-panel">
					<header className="inspector-panel-header">
						<div className="inspector-header-title">
							<span>{activeTabTitle}</span>
							{activeTab === "problems" && allDiagnostics.length > 0 && (
								<Badge tone={errorCount > 0 ? "danger" : "warning"}>
									{allDiagnostics.length}
								</Badge>
							)}
						</div>
						{activeTab === "template" && onEditTemplateMetadata && (
							<Button variant="ghost" onClick={onEditTemplateMetadata}>
								{t("templates.inspector.editMetadata")}
							</Button>
						)}
					</header>

					<div className="inspector-panel-body">
						{/* Tab 1: Problems & Diagnostics */}
						{activeTab === "problems" && (
							<InspectorProblemsTab
								diagnostics={allDiagnostics}
								onJumpToLine={onJumpToLine}
							/>
						)}

						{/* Tab 2: Active Cell & Sub-Order Inspector */}
						{activeTab === "cell" && (
							<InspectorCellDetailsTab activeLine={activeLine} />
						)}

						{/* Tab 3: Slots Overview */}
						{activeTab === "slots" && (
							<InspectorSlotsTab
								validSlots={validSlots}
								cellDefaults={lines}
								onSetDefault={onSetCellDefault}
							/>
						)}

						{/* Tab 4: Quick-Runs & Pinned Macros */}
						{activeTab === "pinned" && (
							<InspectorQuickRunsTab
								pinnedMacros={pinnedMacros}
								onInsertSnippet={onInsertSnippet}
								onOpenTemplatePicker={onOpenTemplatePicker}
							/>
						)}

						{/* Tab 5: Template Structure & Slot Classification */}
						{activeTab === "template" && (
							<InspectorTemplateTab
								activeTemplateDescriptor={activeTemplateDescriptor}
								lines={lines}
								onToggleTemplateLiteralArg={onToggleTemplateLiteralArg}
							/>
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
