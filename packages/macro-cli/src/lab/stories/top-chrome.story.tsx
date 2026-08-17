import { TuiWorkspaceSurface } from "../../ui/compositions";
import { TuiMenuBar } from "../../ui/primitives/TuiMenuBar";
import { type TuiTabItem, TuiTabs } from "../../ui/primitives/TuiTabs";
import type { TuiStory } from "../story-contract";

const TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad", icon: "✎" },
	{ id: "settings", label: "Settings", icon: "⚙" },
	{ id: "extensions", label: "Extensions", icon: "▣", isDirty: true },
];

export const topChromeStory: TuiStory = {
	id: "top-chrome",
	title: "Menu and Two-Row Tab Header",
	category: "Core",
	states: ["one-row", "two-row"],
	sizes: [
		{ columns: 120, rows: 14 },
		{ columns: 60, rows: 14 },
	],
	render(context) {
		return (
			<TuiWorkspaceSurface
				menuBar={
					<TuiMenuBar
						groups={[
							{
								id: "file",
								label: "File",
								items: [{ id: "settings", label: "Settings" }],
							},
							{ id: "view", label: "View", items: [] },
							{ id: "help", label: "Help", items: [] },
						]}
						width={context.size.columns}
						compact={context.size.columns < 80}
					/>
				}
				tabBar={
					<TuiTabs
						tabs={TABS}
						activeTabId="scratchpad"
						rowHeight={context.stateId === "two-row" ? 2 : 1}
					/>
				}
				body={
					<box flexGrow={1} backgroundColor="#10141b">
						<text>Workspace body</text>
					</box>
				}
				width={context.size.columns}
				height={context.size.rows}
				layout={{ showHeaderDivider: false }}
			/>
		);
	},
};
