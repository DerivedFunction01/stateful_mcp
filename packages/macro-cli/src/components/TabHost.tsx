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
			mode: workspace.editor.getMode(),
			emitAction,
			onEmitAction: emitAction,
		});
	}
	return (
		<box padding={1}>
			<text>{tab?.label ?? "Tab"} is not implemented yet.</text>
		</box>
	);
}
