import type { TuiStory } from "../story-contract";
import {
	TuiActivityRail,
	type TuiActivityItem,
} from "../../ui/primitives/TuiActivityRail";
import {
	TuiSidepanel,
	type TuiSidepanelCard,
} from "../../ui/primitives/TuiSidepanel";
import { GlobalThemeRegistry } from "../../ui/theme";

const RAIL_ITEMS: readonly TuiActivityItem[] = [
	{ id: "1", altKey: "1", icon: "⌂", label: "Scratchpad" },
	{ id: "2", altKey: "2", icon: "▧", label: "Notebook" },
	{ id: "3", altKey: "3", icon: "◷", label: "Journal" },
	{ id: "4", altKey: "4", icon: "⚙", label: "Settings" },
];

const WORKSPACE_CARDS: readonly TuiSidepanelCard[] = [
	{ id: "scratchpad", title: "Macro Scratchpad", isActive: true },
	{ id: "notebook", title: "Notebook", isActive: false },
	{ id: "pos", title: "POS application", isActive: false },
];

export const activityRailStory: TuiStory = {
	id: "activity-rail",
	title: "Activity Rail & Sidepanel",
	category: "Core",
	states: [
		"item-1-active",
		"item-2-active",
		"item-3-active",
		"item-4-active",
	],
	render(context) {
		const stateId = context.stateId;
		const activeId =
			stateId === "item-2-active"
				? "2"
				: stateId === "item-3-active"
					? "3"
					: stateId === "item-4-active"
						? "4"
						: "1";

		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		return (
			<box flexDirection="row" backgroundColor={c.bgCanvas} padding={1}>
				{/* 1. Vertical Activity Rail with width-aware glyph centering */}
				<TuiActivityRail items={RAIL_ITEMS} activeId={activeId} theme={theme} />

				{/* Continuous vertical divider between rail and sidepanel */}
				<box width={1} flexDirection="column" alignItems="center">
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
					<text fg={c.borderDefault}>│</text>
				</box>

				{/* 2. Sidepanel / Workspace Explorer matching sketch */}
				<TuiSidepanel
					title="Workspace"
					closeHint="×"
					width={34}
					cards={WORKSPACE_CARDS}
					description="Scratchpads, notebooks, and open application tabs live here."
					theme={theme}
				/>
			</box>
		);
	},
};
