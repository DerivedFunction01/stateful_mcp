import type { TuiStory } from "../story-contract";
import { TuiTabs, type TuiTabItem } from "../../ui/primitives/TuiTabs";

const TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad", icon: "📝" },
	{ id: "notebook", label: "Notebook", icon: "📓", isDirty: true },
	{ id: "pos", label: "POS App", icon: "💳" },
	{ id: "settings", label: "Settings", icon: "⚙️" },
];

export const tabsStory: TuiStory = {
	id: "workspace-tabs",
	title: "Workspace Tabs",
	category: "Core",
	states: ["first-tab-active", "dirty-tab-active", "brackets-style"],
	render(context) {
		const activeId = context.stateId === "dirty-tab-active" ? "notebook" : "scratchpad";
		const style = context.stateId === "brackets-style" ? "brackets" : "standard";

		return (
			<TuiTabs
				tabs={TABS}
				activeTabId={activeId}
				style={style}
			/>
		);
	},
};
