import { type TuiTabItem, TuiTabs } from "../../ui/primitives/TuiTabs";
import type { TuiStory } from "../story-contract";

const STATUS_TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad", icon: "📝" },
	{ id: "notebook", label: "Notebook", icon: "📓", isDirty: true },
	{ id: "pos", label: "POS App", icon: "💳" },
	{ id: "settings", label: "Settings", icon: "⚙️", status: "error" },
];

export const tabsStory: TuiStory = {
	id: "workspace-tabs",
	title: "Workspace Tabs",
	category: "Core",
	states: ["default"],
	render() {
		return (
			<TuiTabs tabs={STATUS_TABS} activeTabId="scratchpad"  />
		);
	},
};
