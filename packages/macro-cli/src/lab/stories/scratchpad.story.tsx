import { TextAttributes } from "@opentui/core";
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

const DEMO_LINES = [
	{
		num: "01",
		sign: "●",
		text: "^deploy service=api env=staging region=us-east-1",
		projection: "↳ Deploying service 'api' to environment 'staging' [ready]",
		isValid: true,
		isActive: true,
	},
	{
		num: "02",
		sign: " ",
		text: "^charge amount=250 currency=USD customer=cust_981",
		projection: "↳ Charge scheduled: $250.00 USD via Stripe [pending]",
		isValid: true,
		isActive: false,
	},
	{
		num: "03",
		sign: " ",
		text: '^notify channel=#deployments msg="Staging deployment ready"',
		projection: "↳ Slack notification queued for #deployments",
		isValid: true,
		isActive: false,
	},
];

export const scratchpadStory: TuiStory = {
	id: "scratchpad",
	title: "Scratchpad Editor Framing & Boundaries",
	category: "Scratchpad",
	states: ["default"],
	render(context) {
		const width = context.size.columns;
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		const leftRailItems = [
			{
				id: "explorer",
				label: "Explorer",
				icon: "📁",
				altKey: "1",
				isActive: true,
			},
			{ id: "journal", label: "Journal", icon: "◷", altKey: "3" },
		];

		const rightRailItems = [
			{
				id: "slots",
				label: "Macro Slots",
				icon: "▧",
				altKey: "2",
				isActive: true,
			},
		];

		// Left Panel
		const leftPanel = (
			<TuiPanelRegion
				dock="start"
				railItems={leftRailItems}
				activeRailId="explorer"
				title="Explorer"
				closeHint="Ctrl+E"
				panelWidth={26}
				isOpen={true}
				theme={theme}
			>
				<box flexDirection="column">
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						workspace/
					</text>
					<text fg={c.fgPrimary}> ├─ schema.macro</text>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{" "}
						├─ deploy.macro
					</text>
					<text fg={c.fgPrimary}> └─ config.json</text>
				</box>
			</TuiPanelRegion>
		);

		// Right Panel
		const rightPanel = (
			<TuiPanelRegion
				dock="end"
				railItems={rightRailItems}
				activeRailId="slots"
				title="Macro Slots"
				closeHint="Alt+2"
				panelWidth={28}
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

		// Shared Editor Line Renderer
		const renderEditorLines = (extraBg?: string) => (
			<box
				flexDirection="column"
				flexGrow={1}
				backgroundColor={extraBg ?? c.bgCanvas}
			>
				{DEMO_LINES.map((line) => {
					const rowBg = line.isActive ? c.bgActive : undefined;
					const leftColor = line.isActive ? c.accentPrimary : "transparent";

					return (
						<box key={line.num} flexDirection="column">
							{/* Row 1: Command text */}
							<box flexDirection="row" backgroundColor={rowBg} height={1}>
								<text fg={leftColor} attributes={TextAttributes.BOLD}>
									{line.isActive ? "▎" : " "}
								</text>
								<text
									fg={line.isActive ? c.accentPrimary : c.fgMuted}
									attributes={TextAttributes.BOLD}
								>
									{" "}
									{line.sign}{" "}
								</text>
								<text
									fg={line.isActive ? c.accentAmber : c.fgDim}
									attributes={line.isActive ? TextAttributes.BOLD : 0}
								>
									{line.num}{" "}
								</text>
								<text fg={c.borderDefault}>│ </text>
								<text
									fg={c.fgPrimary}
									attributes={line.isActive ? TextAttributes.BOLD : 0}
								>
									{line.text}
								</text>
							</box>

							{/* Row 2: Live projection line */}
							{line.projection && (
								<box flexDirection="row" backgroundColor={rowBg} height={1}>
									<text fg={leftColor} attributes={TextAttributes.BOLD}>
										{line.isActive ? "▎" : " "}
									</text>
									<text fg="transparent"> </text>
									<text fg={c.borderDefault}>│ </text>
									<text fg={c.statusSuccess}>{line.projection}</text>
								</box>
							)}
						</box>
					);
				})}
			</box>
		);

		return (
			<box
				flexDirection="column"
				width={width}
				backgroundColor={c.bgCanvas}
				padding={1}
			>
				<box
					backgroundColor={c.bgSurface}
					height={1}
					paddingLeft={0}
					paddingRight={1}
				>
					<TuiTabs
						tabs={DEMO_TABS}
						activeTabId="scratchpad"
						variant="opencode"
						theme={theme}
					/>
				</box>
				<box height={1}>
					<text fg={c.borderSubtle}>{"▔".repeat(Math.max(20, width - 2))}</text>
				</box>

				<box flexDirection="row" flexGrow={1} marginBottom={1}>
					{leftPanel}
					<box
						flexGrow={1}
						flexDirection="column"
						backgroundColor={c.bgElevated}
						paddingLeft={1}
						paddingRight={1}
						marginLeft={1}
						marginRight={1}
					>
						{renderEditorLines(c.bgElevated)}
					</box>
					{rightPanel}
				</box>

				<TuiHelpBar variant="nano-grid" theme={theme} />
				<TuiStatusBar
					mode="NORMAL"
					validCount={3}
					totalCount={3}
					theme={theme}
				/>
			</box>
		);
	},
};
