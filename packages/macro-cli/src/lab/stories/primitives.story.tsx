import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import {
	TuiBadge,
	TuiStatusBadge,
	type TuiStatusType,
} from "../../ui/primitives/TuiBadge";
import { TuiButton } from "../../ui/primitives/TuiButton";
import { TuiDivider } from "../../ui/primitives/TuiDivider";
import { TuiFrame } from "../../ui/primitives/TuiFrame";
import { TuiList, type TuiListItem } from "../../ui/primitives/TuiList";
import { TuiPanel } from "../../ui/primitives/TuiPanel";
import { TuiTree, type TuiTreeNode } from "../../ui/primitives/TuiTree";
import { TuiProgressBar, TuiGauge } from "../../ui/primitives/TuiProgressBar";
import {
	TuiBarChart,
	TuiStackedBarChart,
	TuiBoxPlot,
	TuiHistogram,
	TuiSparkline,
} from "../../ui/primitives/TuiBarChart";
import { TuiTable, type TuiTableColumn } from "../../ui/primitives/TuiTable";
import {
	TuiToggle,
	TuiCheckbox,
	TuiCheckboxGroup,
	TuiRadioGroup,
} from "../../ui/primitives/TuiToggle";
import { TuiSlider, TuiRangeSlider } from "../../ui/primitives/TuiSlider";
import { TuiTagInput } from "../../ui/primitives/TuiTagInput";
import {
	TuiAccordion,
	TuiBreadcrumbs,
	TuiStepper,
} from "../../ui/primitives/TuiAccordion";
import { GlobalThemeRegistry } from "../../ui/theme";
import { createMockWorkspace } from "../mock-workspace";

const LIST_ITEMS: readonly TuiListItem[] = [
	{ id: "1", title: "Initialize workspace", meta: "0.2ms", shortcut: "Enter" },
	{ id: "2", title: "Compile macro definitions", meta: "1.4ms" },
	{ id: "3", title: "Validate syntax tokens", meta: "0.8ms" },
];

const TREE_NODES: readonly TuiTreeNode[] = [
	{
		id: "root-1",
		label: "Session Root (session-alpha)",
		variant: "accent",
		children: [
			{ id: "c1", label: "Cell 1: ^echo message=\"hi\"", variant: "supporting", meta: "[valid]" },
			{ id: "c2", label: "Cell 2: ^deploy env=staging", variant: "supporting", meta: "[valid]" },
			{ id: "c3", label: "Cell 3: raw text", variant: "refuting", meta: "[syntax-error]" },
		],
	},
];

const MEMORY_STACKED_DATA = [
	{
		label: "Heap Mem",
		segments: [
			{ label: "Used", value: 45, color: "#00d7d7" },
			{ label: "Cache", value: 25, color: "#ffaf00" },
			{ label: "Free", value: 30, color: "#585858" },
		],
	},
	{
		label: "V8 Buffer",
		segments: [
			{ label: "Used", value: 60, color: "#00d7d7" },
			{ label: "Cache", value: 15, color: "#ffaf00" },
			{ label: "Free", value: 25, color: "#585858" },
		],
	},
];

const BOX_PLOT_DATA = [
	{ label: "GET /api/v1", min: 12, q1: 28, median: 45, q3: 72, max: 110, unit: "ms" },
	{ label: "POST /transact", min: 24, q1: 52, median: 84, q3: 130, max: 195, unit: "ms", color: "#ffaf00" },
];

const HISTOGRAM_BINS = [
	{ bin: "0-10ms", count: 18 },
	{ bin: "10-25ms", count: 54 },
	{ bin: "25-50ms", count: 112 },
	{ bin: "50-100ms", count: 68 },
	{ bin: "100ms+", count: 14 },
];

interface MacroRegistryRow extends Record<string, unknown> {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly status: string;
	readonly latency: string;
}

const TABLE_COLUMNS: readonly TuiTableColumn<MacroRegistryRow>[] = [
	{ id: "id", header: "ID", width: 6, align: "left" },
	{ id: "name", header: "Macro Module", width: 18, align: "left" },
	{ id: "version", header: "Ver", width: 8, align: "center" },
	{ id: "status", header: "Status", width: 10, align: "center" },
	{ id: "latency", header: "p95", width: 8, align: "right" },
];

const TABLE_DATA: readonly MacroRegistryRow[] = [
	{ id: "01", name: "retail.checkout", version: "v2.1.0", status: "READY", latency: "1.2ms" },
	{ id: "02", name: "stripe.charge", version: "v1.4.2", status: "ACTIVE", latency: "42.0ms" },
	{ id: "03", name: "slack.notify", version: "v3.0.1", status: "IDLE", latency: "18.5ms" },
	{ id: "04", name: "sql.database", version: "v1.0.0", status: "SYNCING", latency: "6.8ms" },
];

const DEMO_TAGS = [
	{ id: "1", label: "production", color: "#38bdf8" },
	{ id: "2", label: "mcp-server", color: "#3fb950" },
	{ id: "3", label: "latency-critical", color: "#f59e0b" },
	{ id: "4", label: "v2-pipeline" },
];

const mockWsEs = createMockWorkspace({ locale: "es" });

const SAMPLE_STATUSES: readonly TuiStatusType[] = [
	"committed",
	"reversed",
	"superseded",
	"executing",
	"failed",
	"pending",
];

export const primitivesStory: TuiStory = {
	id: "primitives",
	title: "Design System Primitives",
	category: "Primitives",
	states: [
		"status-badges-and-glyphs",
		"status-badges-spanish",
		"toggles-and-switches",
		"sliders-and-ranges",
		"tag-chips-and-stepper",
		"accordions",
		"tables-and-themes",
		"cell-navigation",
		"charts-and-distributions",
		"buttons-showcase",
		"progress-and-gauges",
		"lists-and-trees",
	],
	render(context) {
		const stateId = context.stateId;
		const width = Math.min(72, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;
		const i18n = stateId === "status-badges-spanish" ? mockWsEs.workspace.i18n : undefined;

		// 1. STATUS BADGES & GLYPH VARIANTS (ENGLISH / SPANISH)
		if (stateId === "status-badges-and-glyphs" || stateId === "status-badges-spanish") {
			return (
				<TuiFrame
					title={stateId === "status-badges-spanish" ? "Insignias de Estado (Español i18n)" : "Status Badges & Glyphs"}
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						{/* Variant A: Solid Wordless Chip (Compact 3-char tile) */}
						<TuiDivider label="1. Compact Solid Chips without Words (variant='solid-glyph')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={3} flexDirection="row">
									<TuiStatusBadge status={st} variant="solid-glyph" theme={theme} />
									<text fg={c.fgDim} attributes={TextAttributes.DIM}> {st}</text>
								</box>
							))}
						</box>

						{/* Variant B: Solid Pill with Rounded Caps */}
						<TuiDivider label="2. Solid Pill Caps (variant='solid-pill')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={3} flexDirection="row">
									<TuiStatusBadge status={st} variant="solid-pill" theme={theme} />
									<text fg={c.fgDim} attributes={TextAttributes.DIM}> {st}</text>
								</box>
							))}
						</box>

						{/* Variant C: Ultra-Compact Glyphs */}
						<TuiDivider label="3. Ultra-Compact Glyphs (variant='glyph-only')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={3} flexDirection="row">
									<TuiStatusBadge status={st} variant="glyph-only" theme={theme} />
									<text fg={c.fgDim} attributes={TextAttributes.DIM}> {st}</text>
								</box>
							))}
						</box>

						{/* Variant D: Bracket Glyphs */}
						<TuiDivider label="4. Bracketed Glyphs (variant='bracket-glyph')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={2}>
									<TuiStatusBadge status={st} variant="bracket-glyph" theme={theme} />
								</box>
							))}
						</box>

						{/* Variant E: Icon + Localized Label */}
						<TuiDivider label="5. Icon & Localized Label (variant='icon-label')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1} flexWrap="wrap">
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={3} marginBottom={1}>
									<TuiStatusBadge status={st} variant="icon-label" theme={theme} i18n={i18n} />
								</box>
							))}
						</box>

						{/* Variant F: Glowing Dot + Label */}
						<TuiDivider label="6. Glowing Dot Indicator (variant='dot-label')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1} flexWrap="wrap">
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={3} marginBottom={1}>
									<TuiStatusBadge status={st} variant="dot-label" theme={theme} i18n={i18n} />
								</box>
							))}
						</box>

						{/* Variant G: High-Contrast Solid Chips with Label */}
						<TuiDivider label="7. Solid Background Chips with Text (variant='solid-chip')" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1} flexWrap="wrap">
							{SAMPLE_STATUSES.map((st) => (
								<box key={st} marginRight={2} marginBottom={1}>
									<TuiStatusBadge status={st} variant="solid-chip" uppercase theme={theme} i18n={i18n} />
								</box>
							))}
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 2. TOGGLES, SWITCHES, CHECKBOXES & RADIOS
		if (stateId === "toggles-and-switches") {
			return (
				<TuiFrame title="Toggles, Switches, Checkboxes & Radios" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Toggles & Switches" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<TuiToggle label="Auto-compile macros on change" checked={true} isFocused={true} theme={theme} />
							<box height={1} />
							<TuiToggle label="Enable verbose debug logging" checked={false} variant="pill" theme={theme} />
							<box height={1} />
							<TuiToggle label="Streaming AST validation" checked={true} variant="square" theme={theme} />
						</box>

						<TuiDivider label="Checkboxes & Indeterminate States" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiCheckboxGroup
								label="Enabled MCP Transport Layers"
								items={[
									{ id: "1", label: "Standard IO (stdio)", checked: true },
									{ id: "2", label: "Server-Sent Events (SSE)", checked: "indeterminate" },
									{ id: "3", label: "WebSockets RPC (ws)", checked: false },
								]}
								focusedIndex={1}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Radio Groups (Single Selection)" theme={theme} />
						<box marginTop={1}>
							<TuiRadioGroup
								label="Execution Target Environment"
								options={[
									{ id: "local", label: "Local Runtime (V8 isolates)", meta: "[default]" },
									{ id: "sandbox", label: "Docker MicroVM Sandbox", meta: "[isolated]" },
									{ id: "cloud", label: "Remote Kubernetes Cluster", meta: "[us-east-1]" },
								]}
								selectedId="local"
								focusedIndex={0}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 3. SLIDERS & RANGE SLIDERS
		if (stateId === "sliders-and-ranges") {
			return (
				<TuiFrame title="Sliders & Range Sliders" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Continuous Linear Sliders" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<TuiSlider label="CPU Allocation Cap" value={65} unit="%" isFocused={true} theme={theme} />
							<box height={1} />
							<TuiSlider label="Memory Limit" value={82} unit="%" intent="warning" theme={theme} />
							<box height={1} />
							<TuiSlider label="Concurrency Threads" value={4} min={1} max={16} unit=" cores" intent="success" theme={theme} />
						</box>

						<TuiDivider label="Range Sliders (Dual-Thumb Window)" theme={theme} />
						<box flexDirection="column" marginTop={1}>
							<TuiRangeSlider label="Latency SLA Window" range={[20, 80]} unit="ms" isFocused={true} theme={theme} />
							<box height={1} />
							<TuiRangeSlider label="Bandwidth Range" range={[100, 450]} min={0} max={500} unit="MB/s" theme={theme} />
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 4. TAG CHIPS, BREADCRUMBS & STEPPER
		if (stateId === "tag-chips-and-stepper") {
			return (
				<TuiFrame title="Tag Chips, Breadcrumbs & Steppers" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Breadcrumbs Navigation" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiBreadcrumbs
								items={[
									{ id: "1", label: "Workspace", icon: "📁" },
									{ id: "2", label: "Services" },
									{ id: "3", label: "api-gateway" },
									{ id: "4", label: "Config" },
								]}
								activeId="4"
								theme={theme}
							/>
						</box>

						<TuiDivider label="Multi-Step Wizard Stepper" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiStepper
								steps={[
									{ id: "1", label: "1. Configure", status: "completed" },
									{ id: "2", label: "2. Validate", status: "active" },
									{ id: "3", label: "3. Deploy", status: "upcoming" },
								]}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Tokenized Tag Chips & Input" theme={theme} />
						<box marginTop={1}>
							<TuiTagInput
								label="Service Labels & Categories"
								tags={DEMO_TAGS}
								activeIndex={1}
								isFocused={true}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 5. ACCORDIONS & COLLAPSIBLES
		if (stateId === "accordions") {
			return (
				<TuiFrame title="Accordions & Collapsibles" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiAccordion
							sections={[
								{
									id: "1",
									title: "Environment Variables",
									subtitle: "5 configured",
									badge: "ACTIVE",
									isOpen: true,
									content: (
										<box flexDirection="column">
											<text fg={c.fgPrimary}>NODE_ENV=production</text>
											<text fg={c.fgPrimary}>PORT=8080</text>
											<text fg={c.accentPrimary}>MCP_LOG_LEVEL=debug</text>
										</box>
									),
								},
								{
									id: "2",
									title: "Security & TLS Certificates",
									subtitle: "Auto-renewed",
									isOpen: false,
								},
								{
									id: "3",
									title: "Advanced Autoscaling Rules",
									subtitle: "Min: 2, Max: 10",
									isOpen: false,
								},
							]}
							focusedIndex={0}
							theme={theme}
						/>
					</box>
				</TuiFrame>
			);
		}

		// 6. 2D TABLE CELL NAVIGATION
		if (stateId === "cell-navigation") {
			return (
				<TuiFrame title="2D Table Cell Navigation (hjkl / Arrow Keys)" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<box height={1} marginBottom={1} flexDirection="row">
							<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
								Active Cursor: Row 2, Col 3 [Status = "ACTIVE"]
							</text>
							<box flexGrow={1} />
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								Use hjkl / Arrows / Tab to move
							</text>
						</box>

						<TuiDivider label="Office Grid with 2D Cell Focus" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiTable
								columns={TABLE_COLUMNS}
								data={TABLE_DATA}
								selectedCell={{ row: 1, col: 3 }}
								variant="office-grid"
								theme={theme}
							/>
						</box>

						<TuiDivider label="Modern IDE Table with 2D Cell Focus" theme={theme} />
						<box marginTop={1}>
							<TuiTable
								columns={TABLE_COLUMNS}
								data={TABLE_DATA}
								selectedCell={{ row: 1, col: 1 }}
								variant="modern"
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 7. TABLES AND THEME LAYOUTS
		if (stateId === "tables-and-themes") {
			return (
				<TuiFrame title="Data Tables & Multi-Theme Layouts" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Office Grid / Excel Box-Drawing Theme" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiTable columns={TABLE_COLUMNS} data={TABLE_DATA} selectedIndex={1} variant="office-grid" theme={theme} />
						</box>

						<TuiDivider label="Modern IDE Theme with Focus Pillar" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiTable columns={TABLE_COLUMNS} data={TABLE_DATA} selectedIndex={0} variant="modern" theme={theme} />
						</box>

						<TuiDivider label="Zebra Striped Theme" theme={theme} />
						<box marginTop={1}>
							<TuiTable columns={TABLE_COLUMNS} data={TABLE_DATA} selectedIndex={2} variant="zebra" theme={theme} />
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 8. BUTTONS SHOWCASE
		if (stateId === "buttons-showcase" || stateId === "buttons-and-badges") {
			return (
				<TuiFrame title="Buttons & Badges" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<box flexDirection="row" marginBottom={1}>
							<TuiBadge label="NORMAL" intent="success" bold bracketed />
							<text> </text>
							<TuiBadge label="INSERT" intent="warning" bold bracketed />
							<text> </text>
							<TuiBadge label="ERROR" intent="error" bold bracketed />
							<text> </text>
							<TuiBadge label="MCP ACTIVE" intent="info" />
						</box>

						<TuiDivider label="Card Outlines (Border on Idle → Solid Fill on Active)" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<TuiButton label="Macro Scratchpad" variant="outline-to-solid" isSelected={true} width={38} align="left" theme={theme} />
							<box height={1} />
							<TuiButton label="Notebook" variant="outline-to-solid" width={38} align="left" theme={theme} />
							<box height={1} />
							<TuiButton label="POS Application" variant="outline-to-solid" width={38} align="left" theme={theme} />
						</box>

						<TuiDivider label="Semantic Intents: Danger / Success / Warning" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<box flexDirection="row">
								<TuiButton label="Delete (Idle)" variant="outline-to-solid" intent="danger" width={22} theme={theme} />
								<box width={2} />
								<TuiButton label="Delete (Selected)" variant="outline-to-solid" intent="danger" isSelected={true} width={22} theme={theme} />
							</box>
							<box height={1} />
							<box flexDirection="row">
								<TuiButton label="Deploy (Idle)" variant="outline-to-solid" intent="success" width={22} theme={theme} />
								<box width={2} />
								<TuiButton label="Deploy (Selected)" variant="outline-to-solid" intent="success" isSelected={true} width={22} theme={theme} />
							</box>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 9. CHARTS, DISTRIBUTIONS & METRICS
		if (stateId === "charts-and-distributions" || stateId === "charts-and-metrics") {
			return (
				<TuiFrame title="Charts, Distributions & Metrics" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Stacked Memory / Resource Allocation" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiStackedBarChart items={MEMORY_STACKED_DATA} totalWidth={30} theme={theme} />
						</box>

						<TuiDivider label="Box & Whiskers (Min · Q1 · Med · Q3 · Max)" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiBoxPlot items={BOX_PLOT_DATA} width={30} theme={theme} />
						</box>

						<TuiDivider label="Latency Frequency Histogram" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiHistogram bins={HISTOGRAM_BINS} maxBarWidth={24} color={c.accentPrimary} theme={theme} />
						</box>

						<TuiDivider label="Real-Time Metrics Sparkline" theme={theme} />
						<box flexDirection="column" marginTop={1}>
							<TuiSparkline label="Throughput:" values={[12, 18, 32, 45, 68, 92, 85, 64, 78, 105, 120, 115, 98, 84]} color={c.accentPrimary} theme={theme} />
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 10. PROGRESS BARS & GAUGES
		if (stateId === "progress-and-gauges") {
			return (
				<TuiFrame title="Progress Bars & Gauges" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Continuous Sub-Block Progress" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<TuiProgressBar label="Downloading language model weights" value={68} width={42} variant="continuous" theme={theme} />
							<box height={1} />
							<TuiProgressBar label="Compiling runtime AST schemas" value={100} width={42} intent="success" variant="continuous" theme={theme} />
						</box>

						<TuiDivider label="Segmented Meters & Gauges" theme={theme} />
						<box flexDirection="column" marginTop={1}>
							<TuiGauge label="CPU Cores Active:" value={4} max={8} intent="primary" theme={theme} />
							<box height={1} />
							<TuiGauge label="Memory Pressure: " value={5} max={6} intent="warning" theme={theme} />
						</box>
					</box>
				</TuiFrame>
			);
		}

		// 11. LISTS & TREES
		return (
			<TuiFrame title="Lists & Trees" width={width} showBounds={context.showBounds} theme={theme}>
				<box flexDirection="column" padding={1}>
					<TuiList items={LIST_ITEMS} selectedIndex={0} theme={theme} />
					<box marginTop={1} marginBottom={1}>
						<TuiDivider label="Tree Hierarchy" theme={theme} />
					</box>
					<TuiTree nodes={TREE_NODES} theme={theme} />
				</box>
			</TuiFrame>
		);
	},
};
