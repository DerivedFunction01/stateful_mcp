import { TextAttributes } from "@opentui/core";
import type { TuiActivityItem } from "../../ui/primitives/TuiActivityRail";
import { TuiHelpBar } from "../../ui/primitives/TuiHelpBar";
import { TuiPanelRegion } from "../../ui/primitives/TuiPanelRegion";
import type { TuiSidepanelCard } from "../../ui/primitives/TuiSidepanel";
import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";
import { type TuiTabItem, TuiTabs } from "../../ui/primitives/TuiTabs";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const PRIMARY_RAIL_ITEMS: readonly TuiActivityItem[] = [
	{ id: "workspace", altKey: "1", icon: "⌂", label: "Workspace" },
	{ id: "explorer", altKey: "2", icon: "▧", label: "Explorer" },
];

const PRIMARY_CARDS: readonly TuiSidepanelCard[] = [
	{ id: "scratchpad", title: "Macro Scratchpad", isActive: true },
	{ id: "notebook", title: "Notebook", isActive: false },
	{ id: "pos", title: "POS application", isActive: false },
];

const SECONDARY_RAIL_ITEMS: readonly TuiActivityItem[] = [
	{ id: "inspector", altKey: "3", icon: "🔍", label: "Inspector" },
	{ id: "journal", altKey: "4", icon: "◷", label: "Journal" },
	{ id: "diagnostics", altKey: "5", icon: "🧩", label: "Diagnostics" },
];

const INSPECTOR_SLOT_CARDS: readonly TuiSidepanelCard[] = [
	{
		id: "service",
		title: "service: api",
		subtitle: "string · valid",
		badge: "✓",
		isActive: true,
	},
	{
		id: "env",
		title: "env: production",
		subtitle: "enum [staging, prod] · valid",
		badge: "✓",
		isActive: false,
	},
	{
		id: "replicas",
		title: "replicas: 4",
		subtitle: "number · default: 2",
		badge: "info",
		isActive: false,
	},
];

const DEMO_TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad" },
	{ id: "notebook", label: "Notebook", badge: "2" },
	{ id: "settings", label: "Settings" },
];

export const inspectorRegionStory: TuiStory = {
	id: "inspector-region",
	title: "Dual Panel & Inspector Region",
	category: "Views",
	states: [
		"main-focused", // Default: editor has focus, both panels unfocused
		"activity-focused", // Activity panel has keyboard focus
		"inspector-focused", // Inspector panel has keyboard focus
		"swapped-dock-positions",
		"collapsed-sidepanels",
	],
	render(context) {
		const stateId = context.stateId;
		const width = context.size.columns;

		const isSwapped = stateId === "swapped-dock-positions";
		const isCollapsed = stateId === "collapsed-sidepanels";

		// Focus State: determines which pane has keyboard input right now
		const activityFocused = stateId === "activity-focused";
		const inspectorFocused = stateId === "inspector-focused";
		// "main-focused" and others: editor has focus, both panels are just "active" (selected but unfocused)

		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		// Center stage focus outline — bright border when editor has focus
		const mainFocused = !activityFocused && !inspectorFocused;
		const editorBorderColor = mainFocused ? c.borderActive : c.borderSubtle;

		const primaryRegion = (
			<TuiPanelRegion
				dock={isSwapped ? "end" : "start"}
				railItems={PRIMARY_RAIL_ITEMS}
				activeRailId="workspace"
				title="Workspace"
				closeHint="Alt+1"
				panelWidth={26}
				cards={PRIMARY_CARDS}
				isOpen={!isCollapsed}
				isFocused={activityFocused}
				theme={theme}
			/>
		);

		const secondaryRegion = (
			<TuiPanelRegion
				dock={isSwapped ? "start" : "end"}
				railItems={SECONDARY_RAIL_ITEMS}
				activeRailId="inspector"
				title="Node Inspector"
				closeHint="Alt+2"
				panelWidth={32}
				cards={INSPECTOR_SLOT_CARDS}
				description="Inspecting ^deploy ast node parameters."
				isOpen={!isCollapsed}
				isFocused={inspectorFocused}
				theme={theme}
			/>
		);

		return (
			<box
				flexDirection="column"
				width={width}
				backgroundColor={c.bgCanvas}
				padding={1}
			>
				{/* Top Workspace Tab Strip & Connecting Baseline Divider */}
				<TuiTabs tabs={DEMO_TABS} activeTabId="scratchpad" theme={theme} />
				<box height={1}>
					<text fg={c.borderSubtle}>{"▔".repeat(Math.max(20, width - 2))}</text>
				</box>

				{/* Main Triple Column Frame with Composable Swapping */}
				<box flexDirection="row" flexGrow={1} marginBottom={1}>
					{/* Left Region (Primary if default, Secondary if swapped) */}
					{isSwapped ? secondaryRegion : primaryRegion}

					{/* Center Stage — light border framing */}
					<box
						flexGrow={1}
						flexDirection="column"
						borderStyle="single"
						borderColor={mainFocused ? c.borderActive : c.borderSubtle}
						paddingLeft={1}
						paddingRight={1}
					>
						{/* Line 1 (Active) */}
						<box flexDirection="row" backgroundColor={c.bgActive} height={1}>
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								▎
							</text>
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								{" "}
								●{" "}
							</text>
							<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
								01{" "}
							</text>
							<text fg={c.borderDefault}>│ </text>
							<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
								^deploy service=api env=production
							</text>
						</box>
						{/* Live Projection Line */}
						<box flexDirection="row" backgroundColor={c.bgActive} height={1}>
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								▎
							</text>
							<text fg="transparent"> </text>
							<text fg={c.borderDefault}>│ </text>
							<text fg={c.statusSuccess}>
								↳ Deployment scheduled for 4 instances [healthy]
							</text>
						</box>
					</box>

					{/* Right Region (Secondary if default, Primary if swapped) */}
					{isSwapped ? primaryRegion : secondaryRegion}
				</box>

				{/* Bottom Footer & Status Anchors */}
				<box marginBottom={1}>
					<TuiHelpBar theme={theme} />
				</box>
				<box>
					<TuiStatusBar
						variant="lualine"
						mode="NORMAL"
						validCount={1}
						totalCount={1}
						cursorLine={1}
						cursorCol={1}
						pinnedMacro="^deploy"
						theme={theme}
					/>
				</box>
			</box>
		);
	},
};
