import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function ActivityBar({ workspace }: { workspace: MacroWorkspace }) {
	const active = workspace.layout.getSnapshot().activeActivityContainerId;
	return (
		<box flexDirection="column" width={5} borderStyle="single" borderColor="gray">
			{workspace.views.getContainersForRegion("activity").map((container) => (
				<text key={container.id} attributes={container.id === active ? TextAttributes.INVERSE : 0}>
					{container.altKey ?? " "} {container.icon}
				</text>
			))}
		</box>
	);
}
