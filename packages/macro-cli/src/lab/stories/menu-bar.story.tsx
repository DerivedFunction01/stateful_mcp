import { TuiMenuBar, type TuiMenuGroup } from "../../ui/primitives/TuiMenuBar";
import type { TuiStory } from "../story-contract";

const GROUPS: readonly TuiMenuGroup[] = [
	{
		id: "file",
		label: "File",
		items: [
			{ id: "save", label: "Save", shortcut: ":w" },
			{ id: "settings", label: "Settings" },
		],
	},
	{
		id: "edit",
		label: "Edit",
		items: [{ id: "palette", label: "Command Palette", shortcut: "Ctrl+P" }],
	},
	{
		id: "selection",
		label: "Selection",
		items: [{ id: "selectAll", label: "Select All" }],
	},
	{
		id: "view",
		label: "View",
		items: [{ id: "sidepanel", label: "Toggle Sidepanel" }],
	},
	{ id: "go", label: "Go", items: [{ id: "nextTab", label: "Next Tab" }] },
	{ id: "run", label: "Run", items: [{ id: "run", label: "Run Macro" }] },
	{
		id: "terminal",
		label: "Terminal",
		items: [{ id: "new", label: "New Terminal" }],
	},
	{
		id: "help",
		label: "Help",
		items: [{ id: "keyboard", label: "Keyboard Shortcuts" }],
	},
];

export const menuBarStory: TuiStory = {
	id: "menu-bar",
	title: "Top Menu Bar",
	category: "Core",
	states: ["wide", "narrow"],
	sizes: [
		{ columns: 120, rows: 3 },
		{ columns: 60, rows: 3 },
	],
	render(context) {
		return (
			<TuiMenuBar
				groups={GROUPS}
				width={context.size.columns}
				compact={context.size.columns < 80}
			/>
		);
	},
};
