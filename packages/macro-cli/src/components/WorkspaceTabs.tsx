import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiTabs, type TuiTabItem } from "../ui/primitives/TuiTabs";

import type { TuiThemeDefinition } from "../ui/theme";

export function WorkspaceTabs({
	workspace,
	theme,
}: {
	workspace: MacroWorkspace;
	theme?: TuiThemeDefinition;
}) {
	const active = workspace.layout.getSnapshot().activeTabId;
	const tabs: readonly TuiTabItem[] = workspace.tabs.getTabs().map((tab) => ({
		id: tab.id,
		label: tab.label,
		icon: tab.icon,
		isDirty: tab.id === "scratchpad" ? workspace.editor.buffer.getText().length > 0 : false,
	}));

	return (
		<TuiTabs
			tabs={tabs}
			activeTabId={active}
			variant="opencode"
			theme={theme}
		/>
	);
}
