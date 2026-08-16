import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import type { MacroCliViewProvider } from "../renderer";
import { JournalView } from "./JournalView";

export function SidepanelHost({
	workspace,
	width,
	height,
}: {
	workspace: MacroWorkspace;
	width: number;
	height: number;
}) {
	const container = workspace.views.getContainer(
		workspace.layout.getSnapshot().activeContainerId,
	);
	if (container?.id === "journal") return <JournalView workspace={workspace} />;
	const view = workspace.views
		.getViewsForContainer(container?.id ?? "")
		.find((candidate) => candidate.provider);
	if (view?.provider) {
		const provider = view.provider as unknown as MacroCliViewProvider;
		const emitAction = (actionId: string, payload?: unknown) => {
			void workspace.commands.executeCommand(actionId, payload);
		};
		return provider.render({
			viewId: view.id,
			workspace,
			width,
			height,
			isFocused: workspace.layout.getSnapshot().focusedPane === "sidepanel",
			emitAction,
			onEmitAction: emitAction,
		});
	}
	return (
		<Box padding={1} flexDirection="column">
			<Text bold>{container?.title ?? "Sidepanel"}</Text>
			<Text dimColor>Core view ready for contributed content.</Text>
		</Box>
	);
}
