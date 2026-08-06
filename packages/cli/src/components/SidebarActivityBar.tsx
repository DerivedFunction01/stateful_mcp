import { Box, Text } from "ink";
import type { SidebarViewTab } from "../lib/editor/kernel";

export type { SidebarViewTab } from "../lib/editor/kernel";

export interface SidebarTabMeta {
	id: SidebarViewTab;
	index: number;
	icon: string;
	label: string;
	altKey: string;
}

/** Vertical activity bar tab order (top to bottom). */
export const SIDEBAR_TABS: readonly SidebarTabMeta[] = [
	{
		id: "branches",
		index: 0,
		icon: "■",
		label: "Branches & Live Scratchpad",
		altKey: "1",
	},
	{
		id: "slots",
		index: 1,
		icon: "▧",
		label: "Macro Slots & Validation",
		altKey: "2",
	},
	{
		id: "history",
		index: 2,
		icon: "◷",
		label: "History & Journal",
		altKey: "3",
	},
];

export const DEFAULT_SIDEBAR_TAB: SidebarViewTab = "branches";

export const SIDEBAR_ACTIVITY_BAR_WIDTH = 3;

/** Resolve a SidebarViewTab from an Alt+digit shortcut, or null if unmapped. */
export function sidebarTabForAlt(input: string): SidebarViewTab | null {
	const meta = SIDEBAR_TABS.find((tab) => tab.altKey === input);
	return meta ? meta.id : null;
}

/** Cycle to the next (or previous) tab in the vertical activity bar. */
export function nextSidebarTab(
	tab: SidebarViewTab,
	delta: 1 | -1 = 1,
): SidebarViewTab {
	const index = SIDEBAR_TABS.findIndex((t) => t.id === tab);
	if (index < 0) return DEFAULT_SIDEBAR_TAB;
	const next = (index + delta + SIDEBAR_TABS.length) % SIDEBAR_TABS.length;
	return SIDEBAR_TABS[next]?.id ?? DEFAULT_SIDEBAR_TAB;
}

export interface SidebarActivityBarProps {
	activeTab: SidebarViewTab;
	onSelectTab(tab: SidebarViewTab): void;
}

/**
 * Vertical icon strip docked on the RIGHT border of the sidebar panel. Each
 * row maps to a sidebar view selectable via Alt+<digit>.
 */
export function SidebarActivityBar({
	activeTab,
	onSelectTab: _onSelectTab,
}: SidebarActivityBarProps) {
	return (
		<Box
			flexDirection="column"
			width={SIDEBAR_ACTIVITY_BAR_WIDTH}
			borderStyle="single"
			borderColor="gray"
		>
			{SIDEBAR_TABS.map((tab) => {
				const active = tab.id === activeTab;
				return (
					<Box key={tab.id} width={SIDEBAR_ACTIVITY_BAR_WIDTH} height={1}>
						<Text
							bold={active}
							inverse={active}
							color={active ? "green" : "gray"}
						>
							{tab.icon}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
