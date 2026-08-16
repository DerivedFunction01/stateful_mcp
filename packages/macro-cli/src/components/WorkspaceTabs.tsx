import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function WorkspaceTabs({ workspace }: { workspace: MacroWorkspace }) {
	const active = workspace.layout.getSnapshot().activeTabId;
	return (
		<box height={1} paddingLeft={1} overflow="hidden">
			{workspace.tabs.getTabs().map((tab, index) => (
				<text key={tab.id} attributes={tab.id === active ? TextAttributes.INVERSE : 0}>
					{index ? "  " : ""}[{tab.icon ?? " "} {tab.label}]
				</text>
			))}
		</box>
	);
}
