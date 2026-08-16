import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function WorkspaceTabs({ workspace }: { workspace: MacroWorkspace }) {
	const active = workspace.layout.getSnapshot().activeTabId;
	return (
		<Box height={1} paddingLeft={1} overflow="hidden">
			{workspace.tabs.getTabs().map((tab, index) => (
				<Text key={tab.id} inverse={tab.id === active}>
					{index ? "  " : ""}[{tab.icon ?? " "} {tab.label}]
				</Text>
			))}
		</Box>
	);
}
