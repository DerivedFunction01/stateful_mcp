import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import { useWindowLayout } from "./WindowLayoutContext";
import { type WorkspaceTabId, WorkspaceTabs } from "./WorkspaceTabs";
import { WorkspaceView } from "./WorkspaceView";

interface NotebookWorkspaceProps {
	activeTab: WorkspaceTabId;
	snapshot?: WorkspaceSnapshot | null;
	loading?: boolean;
	error?: string | null;
	focused?: boolean;
}

export function NotebookWorkspace({
	activeTab,
	snapshot = null,
	loading = false,
	error = null,
	focused = false,
}: NotebookWorkspaceProps) {
	const layout = useWindowLayout();
	const label =
		activeTab === "notebook"
			? "Main notebook workspace"
			: `${activeTab[0]?.toUpperCase() ?? ""}${activeTab.slice(1)} workspace`;
	return (
		<Box flexDirection="column" width="100%" height={layout.workspaceRows}>
			<WorkspaceTabs active={activeTab} />
			<Box flexGrow={1} paddingLeft={1} overflow="hidden">
				{activeTab === "assessment" ? (
					<WorkspaceView
						snapshot={snapshot}
						loading={loading}
						error={error}
						focused={focused}
					/>
				) : (
					<Text color="gray">{label}</Text>
				)}
			</Box>
		</Box>
	);
}
