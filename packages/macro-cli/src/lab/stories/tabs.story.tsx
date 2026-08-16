import type { TuiStory } from "../story-contract";
import { TuiTabs, type TuiTabItem } from "../../ui/primitives/TuiTabs";

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
	states: ["opencode-solid-accent", "browser-prototype-card", "vscode-pipes"],
	render(context) {
		if (context.stateId === "vscode-pipes") {
			return (
				<TuiTabs
					tabs={STATUS_TABS}
					activeTabId="notebook"
					variant="vscode"
				/>
			);
		}

		if (context.stateId === "browser-prototype-card") {
			return (
				<TuiTabs
					tabs={STATUS_TABS}
					activeTabId="scratchpad"
					variant="browser"
				/>
			);
		}

		return (
			<TuiTabs
				tabs={STATUS_TABS}
				activeTabId="scratchpad"
				variant="opencode"
			/>
		);
	},
};
