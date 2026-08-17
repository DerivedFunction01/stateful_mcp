import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiActivityRail, type TuiActivityItem } from "../ui/primitives/TuiActivityRail";
import type { TuiThemeDefinition } from "../ui/theme";

export function ActivityBar({
	workspace,
	theme,
}: {
	workspace: MacroWorkspace;
	theme?: TuiThemeDefinition;
}) {
	const active = workspace.layout.getSnapshot().activeActivityContainerId;
	const containers = workspace.views.getContainersForRegion("activity");

	const items: readonly TuiActivityItem[] = containers.map((c) => ({
		id: c.id,
		label: c.title,
		icon: c.icon ?? "⌂",
		altKey: c.altKey,
		isActive: c.id === active,
	}));

	return (
		<TuiActivityRail
			items={items}
			activeId={active}
			theme={theme}
		/>
	);
}
