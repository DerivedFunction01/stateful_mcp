import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import {
	GlobalThemeRegistry,
	type TuiThemeDefinition,
} from "../../ui/theme";
import { TuiTabs, type TuiTabItem } from "../../ui/primitives/TuiTabs";
import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";
import { TuiHelpBar } from "../../ui/primitives/TuiHelpBar";
import { TuiCommandPalette } from "../../ui/primitives/TuiCommandPalette";

const DEMO_TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad" },
	{ id: "notebook", label: "Notebook", badge: "2" },
	{ id: "settings", label: "Settings" },
];

export const themesStory: TuiStory = {
	id: "themes",
	title: "Theme & Palette Switcher",
	category: "Core",
	states: [
		"github-dark",
		"github-light",
		"opencode-dark",
		"monokai-pro",
		"nord-polar",
	],
	render(context) {
		const stateId = context.stateId;
		const width = context.size.columns;

		let themeId = "github-dark";
		if (stateId === "github-light") themeId = "github-light";
		if (stateId === "opencode-dark") themeId = "opencode-dark";
		if (stateId === "monokai-pro") themeId = "monokai";
		if (stateId === "nord-polar") themeId = "nord";

		const theme: TuiThemeDefinition =
			GlobalThemeRegistry.get(themeId) ?? GlobalThemeRegistry.getActive();
		const c = theme.colors;

		return (
			<box flexDirection="column" width={width} backgroundColor={c.bgCanvas} padding={1}>
				{/* Header: Theme Meta */}
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						Theme: {theme.name}
					</text>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{"  "}[mode: {theme.mode.toUpperCase()}]
					</text>
				</box>

				{/* 1. Theme Color Swatches Bar */}
				<box height={1} marginBottom={1} flexDirection="row">
					<box backgroundColor={c.bgCanvas} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgPrimary}>canvas</text>
					</box>
					<box backgroundColor={c.bgSurface} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgPrimary}>surface</text>
					</box>
					<box backgroundColor={c.bgElevated} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgPrimary}>elevated</text>
					</box>
					<box backgroundColor={c.bgActive} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgPrimary}>active</text>
					</box>
					<box backgroundColor={c.bgSelect} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.bgSelectText} attributes={TextAttributes.BOLD}>select</text>
					</box>
					<box backgroundColor={c.statusSuccess} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>success</text>
					</box>
					<box backgroundColor={c.statusError} paddingLeft={1} paddingRight={1}>
						<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>error</text>
					</box>
				</box>

				{/* 2. Top Tabs Strip */}
				<box marginBottom={1}>
					<TuiTabs tabs={DEMO_TABS} activeTabId="scratchpad" variant="opencode" theme={theme} />
				</box>

				{/* 3. Scratchpad Cell Preview in this theme */}
				<box
					flexDirection="column"
					backgroundColor={c.bgElevated}
					paddingLeft={1}
					paddingRight={1}
					marginBottom={1}
				>
					{/* Line 1 (Active) */}
					<box flexDirection="row" backgroundColor={c.bgActive} height={1}>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							▎
						</text>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							{" "}●{" "}
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
						<text fg="transparent">      </text>
						<text fg={c.borderDefault}>│ </text>
						<text fg={c.statusSuccess}>
							↳ Deployment scheduled for 2 instances [healthy]
						</text>
					</box>
				</box>

				{/* 4. Embedded Command Palette preview */}
				<box marginBottom={1}>
					<TuiCommandPalette
						variant="opencode-bordered"
						items={[
							{ id: "1", title: "Switch session", category: "Suggested", shortcut: "ctrl+x l" },
							{ id: "2", title: "Switch theme", category: "System", shortcut: "ctrl+x t" },
						]}
						selectedIndex={0}
						width={Math.min(68, width - 4)}
						theme={theme}
					/>
				</box>

				{/* 5. Status Bar & Help Bar */}
				<box marginBottom={1}>
					<TuiHelpBar variant="nano-grid" theme={theme} />
				</box>
				<box>
					<TuiStatusBar
						variant="lualine"
						mode="NORMAL"
						validCount={2}
						totalCount={2}
						cursorLine={1}
						cursorCol={1}
						theme={theme}
					/>
				</box>
			</box>
		);
	},
};
