import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function ActivityBar({ workspace }: { workspace: MacroWorkspace }) {
	const active = workspace.layout.getSnapshot().activeContainerId;
	return (
		<Box flexDirection="column" width={5} borderStyle="single" borderColor="gray">
			{workspace.views.getContainers().map((container) => (
				<Text key={container.id} inverse={container.id === active}>
					{container.altKey ?? " "} {container.icon}
				</Text>
			))}
		</Box>
	);
}
