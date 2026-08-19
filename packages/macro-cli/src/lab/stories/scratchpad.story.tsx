import { TextAttributes } from "@opentui/core";
import {
	TuiScratchpadBody,
	type TuiScratchpadLineModel,
	TuiWorkspaceSurface,
} from "../../ui/compositions";
import { TuiHelpBar } from "../../ui/primitives/TuiHelpBar";
import { TuiPanelRegion } from "../../ui/primitives/TuiPanelRegion";
import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";
import { type TuiTabItem, TuiTabs } from "../../ui/primitives/TuiTabs";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const DEMO_TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad", icon: "✏", isDirty: true },
	{ id: "notebook", label: "Notebook", icon: "📓" },
	{ id: "settings", label: "Settings", icon: "⚙" },
];

const DEMO_LINES: readonly TuiScratchpadLineModel[] = [
	{
		id: "01",
		lineNumber: "01",
		text: "^deploy service=api env=staging region=us-east-1",
		projection: "Deploying service 'api' to environment 'staging' [ready]",
		state: "active",
	},
	{
		id: "02",
		lineNumber: "02",
		text: "^charge amount=250 currency=USD customer=cust_981",
		projection: "Charge scheduled: $250.00 USD via Stripe [pending]",
		state: "valid",
	},
	{
		id: "03",
		lineNumber: "03",
		text: '^notify channel=#deployments msg="Staging deployment ready"',
		projection: "Slack notification queued for #deployments",
		state: "valid",
	},
];

export const scratchpadStory: TuiStory = {
	id: "scratchpad",
	title: "Scratchpad Editor Framing & Boundaries",
	category: "Scratchpad",
	states: ["default"],
	render(context) {
		const width = context.size.columns;
		const height = context.size.rows;
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		const leftPanel = (
			<TuiPanelRegion
				dock="start"
				railItems={[
					{
						id: "explorer",
						label: "Explorer",
						icon: "📁",
						altKey: "1",
						isActive: true,
					},
					{ id: "journal", label: "Journal", icon: "◷", altKey: "3" },
				]}
				activeRailId="explorer"
				title="Explorer"
				closeHint="Ctrl+E"
				panelWidth={26}
				height={height}
				isOpen={true}
				theme={theme}
			>
				<box flexDirection="column">
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						workspace/
					</text>
					<text fg={c.fgPrimary}> ├─ schema.macro</text>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						├─ deploy.macro
					</text>
					<text fg={c.fgPrimary}> └─ config.json</text>
				</box>
			</TuiPanelRegion>
		);

		const rightPanel = (
			<TuiPanelRegion
				dock="end"
				railItems={[
					{
						id: "slots",
						label: "Macro Slots",
						icon: "▧",
						altKey: "2",
						isActive: true,
					},
				]}
				activeRailId="slots"
				title="Macro Slots"
				closeHint="Alt+2"
				panelWidth={28}
				height={height}
				cards={[
					{
						id: "s1",
						title: "service",
						subtitle: "api",
						badge: "string",
						isActive: true,
					},
					{ id: "s2", title: "env", subtitle: "staging", badge: "enum" },
					{ id: "s3", title: "region", subtitle: "us-east-1", badge: "opt" },
				]}
				isOpen={true}
				theme={theme}
			/>
		);

		return (
			<TuiWorkspaceSurface
				header={
					<TuiTabs
						tabs={DEMO_TABS}
						activeTabId="scratchpad"
						
						theme={theme}
					/>
				}
				startRegion={leftPanel}
				body={
					<TuiScratchpadBody
						lines={DEMO_LINES}
						activeLineId="01"
						showProjections={true}
						theme={theme}
					/>
				}
				endRegion={rightPanel}
				footer={
					<>
						<TuiHelpBar theme={theme} />
						<TuiStatusBar
							mode="NORMAL"
							validCount={3}
							totalCount={3}
							theme={theme}
						/>
					</>
				}
				width={width}
				height={height}
				layout={{
					outerPadding: 1,
					bodyFrame: "none",
					activityWidth: 26,
					inspectorWidth: 28,
				}}
				theme={theme}
			/>
		);
	},
};
