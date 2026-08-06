import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import type { ReactNode } from "react";
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
	selectedBranchId?: string | null;
	assessmentSearchOpen?: boolean;
	assessmentSearchQuery?: string;
}

export function NotebookWorkspace({
	activeTab,
	snapshot = null,
	loading = false,
	error = null,
	focused = false,
	assessmentSubTab = "default",
	scratchpadContent,
	selectedBranchId,
	assessmentSearchOpen = false,
	assessmentSearchQuery = "",
}: NotebookWorkspaceProps) {
	const layout = useWindowLayout();
	const label =
		activeTab === "notebook"
			? "Main notebook workspace"
			: `${activeTab[0]?.toUpperCase() ?? ""}${activeTab.slice(1)} workspace`;
	return (
		<Box flexDirection="column" width="100%" height={layout.workspaceRows}>
			<WorkspaceTabs active={activeTab} />
			{activeTab === "assessment" && (
				<AssessmentTabs active={assessmentSubTab} />
			)}
			<Box flexGrow={1} paddingLeft={1} overflow="hidden">
				{activeTab === "assessment" ? (
					<>
						{assessmentSubTab === "default" && (
							<WorkspaceView
								snapshot={snapshot}
								loading={loading}
								error={error}
								focused={focused}
								selectedBranchId={selectedBranchId}
								searchOpen={assessmentSearchOpen}
								searchQuery={assessmentSearchQuery}
							/>
						)}
						{scratchpadContent}
					</>
				) : (
					<Text color="gray">{label}</Text>
				)}
			</Box>
		</Box>
	);
}
