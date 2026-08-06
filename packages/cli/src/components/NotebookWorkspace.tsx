import { Box, Text } from "ink";
import { useWindowLayout } from "./WindowLayoutContext";
import { type WorkspaceTabId, WorkspaceTabs } from "./WorkspaceTabs";

export function NotebookWorkspace({
	activeTab,
}: {
	activeTab: WorkspaceTabId;
}) {
	const layout = useWindowLayout();
	const label =
		activeTab === "notebook"
			? "Main notebook workspace"
			: `${activeTab[0]?.toUpperCase() ?? ""}${activeTab.slice(1)} workspace`;
	return (
		<Box flexDirection="column" width="100%" height={layout.workspaceRows}>
			<WorkspaceTabs active={activeTab} />
			<Box flexGrow={1} paddingLeft={1}>
				<Text color="gray">{label}</Text>
			</Box>
		</Box>
	);
}
