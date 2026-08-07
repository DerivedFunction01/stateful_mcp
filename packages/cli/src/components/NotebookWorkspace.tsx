import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { t } from "../lib/shared/i18n";
import { useWindowLayout } from "./WindowLayoutContext";
import {
	type AssessmentSubTabId,
	AssessmentTabs,
	type WorkspaceTabId,
	WorkspaceTabs,
} from "./WorkspaceTabs";
import { WorkspaceView } from "./WorkspaceView";

interface NotebookWorkspaceProps {
	activeTab: WorkspaceTabId;
	snapshot?: WorkspaceSnapshot | null;
	loading?: boolean;
	error?: string | null;
	focused?: boolean;
	assessmentSubTab?: AssessmentSubTabId;
	scratchpadContent?: ReactNode;
	editorContent?: ReactNode;
	selectedBranchId?: string | null;
	selectedBranchIds?: readonly string[];
	assessmentSearchOpen?: boolean;
	assessmentSearchQuery?: string;
	soapContent?: ReactNode;
	sectionContent?: Partial<
		Record<"subjective" | "objective" | "assessment" | "plan", ReactNode>
	>;
	sectionScratchpadContent?: Partial<
		Record<"subjective" | "objective" | "assessment" | "plan", ReactNode>
	>;
	sectionEditorContent?: Partial<
		Record<"subjective" | "objective" | "assessment" | "plan", ReactNode>
	>;
}

export function NotebookWorkspace({
	activeTab,
	snapshot = null,
	loading = false,
	error = null,
	focused = false,
	assessmentSubTab,
	scratchpadContent,
	editorContent,
	selectedBranchId,
	selectedBranchIds,
	assessmentSearchOpen = false,
	assessmentSearchQuery = "",
	soapContent,
	sectionContent,
	sectionScratchpadContent,
	sectionEditorContent,
}: NotebookWorkspaceProps) {
	const layout = useWindowLayout();
	const label =
		activeTab === "notebook"
			? t("workspace.mainNotebook")
			: activeTab === "subjective" ||
					activeTab === "objective" ||
					activeTab === "assessment" ||
					activeTab === "plan"
				? t(`section.${activeTab}`)
				: t("workspace.tabWorkspace", {
						value: t(`workspace.tab.${activeTab}`),
					});
	return (
		<Box flexDirection="column" width="100%" height={layout.workspaceRows}>
			<WorkspaceTabs active={activeTab} />
			{activeTab !== "notebook" && activeTab !== "soap" && assessmentSubTab && (
				<AssessmentTabs active={assessmentSubTab} />
			)}
			<Box flexGrow={1} paddingLeft={1} overflow="hidden">
				{activeTab === "assessment" ? (
					assessmentSubTab === "default" ? (
						<WorkspaceView
							snapshot={snapshot}
							loading={loading}
							error={error}
							focused={focused}
							selectedBranchId={selectedBranchId}
							selectedBranchIds={selectedBranchIds}
							searchOpen={assessmentSearchOpen}
							searchQuery={assessmentSearchQuery}
						/>
					) : assessmentSubTab === "scratchpad" ? (
						scratchpadContent
					) : (
						editorContent
					)
				) : activeTab === "subjective" ||
					activeTab === "objective" ||
					activeTab === "plan" ? (
					assessmentSubTab === "scratchpad" ? (
						(sectionScratchpadContent?.[activeTab] ??
						sectionContent?.[activeTab])
					) : (
						sectionEditorContent?.[activeTab]
					)
				) : activeTab === "soap" ? (
					(soapContent ?? <Text color="gray">SOAP workspace unavailable</Text>)
				) : (
					<Text color="gray">{label}</Text>
				)}
			</Box>
		</Box>
	);
}
