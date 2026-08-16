import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import type { MacroCliTabProvider } from "../renderer";

export function TabHost({
	workspace,
	width,
	height,
}: {
	workspace: MacroWorkspace;
	width: number;
	height: number;
}) {
	const tab = workspace.tabs.getTab(workspace.layout.getSnapshot().activeTabId);
	if (tab?.provider) {
		const provider = tab.provider as unknown as MacroCliTabProvider;
		const emitAction = (actionId: string, payload?: unknown) => {
			void workspace.commands.executeCommand(actionId, payload);
		};
		return provider.render({
			tabId: tab.id,
			workspace,
			width,
			height,
			isFocused: workspace.layout.getSnapshot().focusedPane === "main",
			emitAction,
			onEmitAction: emitAction,
		});
	}
	return (
		<Box padding={1}>
			<Text>{tab?.label ?? "Tab"} is not implemented yet.</Text>
		</Box>
	);
}
