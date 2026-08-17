import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiNamedColors } from "../ui/tokens";

export function ActivityBar({ workspace }: { workspace: MacroWorkspace }) {
	const active = workspace.layout.getSnapshot().activeActivityContainerId;

	return (
		<box
			flexDirection="column"
			width={6}
			borderStyle="single"
			borderColor={TuiNamedColors.border}
			paddingLeft={1}
			paddingTop={1}
		>
			{workspace.views.getContainersForRegion("activity").map((container) => {
				const isActive = container.id === active;
				return (
					<box key={container.id} height={1} marginBottom={1}>
						<text
							attributes={isActive ? TextAttributes.BOLD : 0}
							fg={isActive ? "cyan" : TuiNamedColors.muted}
						>
							{isActive ? ">" : " "}{container.altKey ?? " "}{container.icon}
						</text>
					</box>
				);
			})}
		</box>
	);
}
