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
import { TuiTable, type TuiTableColumn } from "../../ui/primitives/TuiTable";
import { TuiInput } from "../../ui/primitives/TuiInput";
import { TuiDropdown } from "../../ui/primitives/TuiDropdown";
import { TuiToggle } from "../../ui/primitives/TuiToggle";
import { TuiSlider } from "../../ui/primitives/TuiSlider";
import { TuiColorPicker } from "../../ui/primitives/TuiColorPicker";
import { TuiDatePicker } from "../../ui/primitives/TuiDatePicker";
import { TuiCompletionPopup, type TuiCompletionCandidate } from "../../ui/primitives/TuiCompletionPopup";

const DEMO_TABS: readonly TuiTabItem[] = [
	{ id: "scratchpad", label: "Scratchpad" },
	{ id: "notebook", label: "Notebook", badge: "2" },
	{ id: "settings", label: "Settings" },
];

interface ThemeTableDemoRow extends Record<string, unknown> {
	readonly id: string;
	readonly service: string;
	readonly env: string;
	readonly status: string;
	readonly cost: string;
}

const DEMO_TABLE_COLUMNS: readonly TuiTableColumn<ThemeTableDemoRow>[] = [
	{ id: "id", header: "ID", width: 5, align: "left" },
	{ id: "service", header: "Service", width: 14, align: "left" },
	{ id: "env", header: "Env", width: 9, align: "center" },
	{ id: "status", header: "Status", width: 10, align: "center" },
	{ id: "cost", header: "Cost/mo", width: 10, align: "right" },
];

const DEMO_TABLE_DATA: readonly ThemeTableDemoRow[] = [
	{ id: "01", service: "api-gateway", env: "prod", status: "HEALTHY", cost: "$120.00" },
	{ id: "02", service: "auth-service", env: "staging", status: "ACTIVE", cost: "$45.50" },
	{ id: "03", service: "worker-pool", env: "prod", status: "IDLE", cost: "$210.00" },
];

const REGION_OPTIONS = [
	{ id: "us-east", label: "US East (N. Virginia)", icon: "🌎" },
	{ id: "eu-west", label: "EU West (Ireland)", icon: "🌍" },
];

const THEME_COMPLETION_CANDIDATES: readonly TuiCompletionCandidate[] = [
	{
		id: "c1",
		label: "^deploy",
		kind: "Macro",
		detail: "^deploy service=<id> env=<tier>",
		documentation: "Triggers automated deployment of containerized service.",
		params: [
			{ name: "service", type: "string", description: "api | auth | worker" },
			{ name: "env", type: "string", description: "dev | staging | prod" },
		],
	},
	{
		id: "c2",
		label: "^echo",
		kind: "Macro",
		detail: "^echo message=<string>",
		documentation: "Prints output payload to session scratchpad buffer.",
	},
	{
		id: "c3",
		label: "service",
		kind: "Slot",
		detail: "service: api | auth | worker",
		documentation: "Designated microservice identifier.",
	},
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
					<box backgroundColor={c.accentPrimary} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgInverse}>accent</text>
					</box>
					<box backgroundColor={c.statusSuccess} paddingLeft={1} paddingRight={1} marginRight={1}>
						<text fg={c.fgInverse}>success</text>
					</box>
					<box backgroundColor={c.statusError} paddingLeft={1} paddingRight={1}>
						<text fg={c.fgInverse}>error</text>
					</box>
				</box>

				{/* 2. Tab Bar with Elevated Shelf */}
				<box backgroundColor={c.bgSurface} height={1}>
					<TuiTabs tabs={DEMO_TABS} activeTabId="scratchpad" variant="opencode" theme={theme} />
				</box>
				<box height={1} marginBottom={1}>
					<text fg={c.borderSubtle}>{"▔".repeat(Math.max(20, width - 2))}</text>
				</box>

				{/* 3. Form Controls & Interactive Primitives in Theme */}
				<box flexDirection="row" marginBottom={1}>
					<box flexDirection="column" marginRight={2}>
						<TuiInput
							label="Service Name"
							value="api-gateway"
							prefix="⬡"
							isFocused={true}
							width={22}
							theme={theme}
						/>
					</box>
					<box flexDirection="column" marginRight={2}>
						<TuiDropdown
							label="Region"
							options={REGION_OPTIONS}
							selectedId="us-east"
							width={24}
							theme={theme}
						/>
					</box>
					<box flexDirection="column" marginRight={2}>
						<TuiColorPicker
							label="Accent"
							value={c.accentPrimary}
							width={20}
							theme={theme}
						/>
					</box>
					<box flexDirection="column">
						<TuiDatePicker
							label="Deploy Date"
							value={{ year: 2025, month: 8, day: 17 }}
							width={20}
							theme={theme}
						/>
					</box>
				</box>

				<box flexDirection="row" marginBottom={1}>
					<box flexDirection="column" marginRight={3}>
						<TuiToggle label="Auto-deploy" checked={true} isFocused={true} theme={theme} />
					</box>
					<box flexDirection="column" width={32}>
						<TuiSlider label="CPU Limit" value={75} unit="%" isFocused={true} theme={theme} />
					</box>
				</box>

				{/* 4. Completion Popup & Documentation Sidecar */}
				<box marginBottom={1}>
					<TuiCompletionPopup
						candidates={THEME_COMPLETION_CANDIDATES}
						selectedIndex={0}
						width={Math.min(70, width - 4)}
						theme={theme}
					/>
				</box>

				{/* 5. Themed Data Table Preview */}
				<box marginBottom={1}>
					<TuiTable
						columns={DEMO_TABLE_COLUMNS}
						data={DEMO_TABLE_DATA}
						selectedIndex={0}
						variant="office-grid"
						theme={theme}
					/>
				</box>

				{/* 6. Embedded Command Palette preview */}
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

				{/* 7. Status Bar & Help Bar */}
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
