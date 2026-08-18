import { TextAttributes } from "@opentui/core";
import { TuiColorPicker } from "../../ui/primitives/TuiColorPicker";
import {
	TuiDatePicker,
	type TuiDatePickerDate,
} from "../../ui/primitives/TuiDatePicker";
import { TuiDivider } from "../../ui/primitives/TuiDivider";
import {
	TuiDropdown,
	type TuiDropdownOption,
} from "../../ui/primitives/TuiDropdown";
import { TuiFrame } from "../../ui/primitives/TuiFrame";
import { TuiInput, TuiInputModal } from "../../ui/primitives/TuiInput";
import { TuiSlider } from "../../ui/primitives/TuiSlider";
import { TuiTagInput } from "../../ui/primitives/TuiTagInput";
import { TuiToggle } from "../../ui/primitives/TuiToggle";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

// ─── Sample data ──────────────────────────────────────────────────────────────

const REGION_OPTIONS: readonly TuiDropdownOption[] = [
	{ id: "us-east", label: "US East (N. Virginia)", icon: "🌎", meta: "us-e1" },
	{ id: "us-west", label: "US West (Oregon)", icon: "🌎", meta: "us-w2" },
	{ id: "eu-west", label: "EU West (Ireland)", icon: "🌍", meta: "eu-w1" },
	{
		id: "eu-central",
		label: "EU Central (Frankfurt)",
		icon: "🌍",
		meta: "eu-c1",
	},
	{
		id: "ap-northeast",
		label: "AP Northeast (Tokyo)",
		icon: "🌏",
		meta: "ap-ne1",
	},
	{ id: "divider-1", label: "", divider: true },
	{ id: "local", label: "Localhost (dev)", icon: "💻", meta: "local" },
];

const PLAN_OPTIONS: readonly TuiDropdownOption[] = [
	{ id: "free", label: "Free", icon: "◇", meta: "$0/mo" },
	{ id: "pro", label: "Pro", icon: "◈", meta: "$29/mo" },
	{ id: "team", label: "Team", icon: "◉", meta: "$99/mo" },
	{
		id: "enterprise",
		label: "Enterprise",
		icon: "★",
		meta: "custom",
		disabled: true,
	},
];

const SAMPLE_DATE: TuiDatePickerDate = { year: 2026, month: 8, day: 18 };
const DEMO_TAGS = [
	{ id: "1", label: "production", color: "#38bdf8" },
	{ id: "2", label: "mcp-server", color: "#3fb950" },
	{ id: "3", label: "latency-critical", color: "#f59e0b" },
];

// ─── Story ────────────────────────────────────────────────────────────────────

export const formInputsStory: TuiStory = {
	id: "form-inputs",
	title: "Form Input Primitives",
	category: "Primitives",
	states: [
		"inputs",
		"dropdowns",
		"color-picker",
		"date-picker",
		"sliders",
		"toggles",
		"tags",
		"form-composition",
	],
	render(context) {
		const stateId = context.stateId;
		const width = Math.min(72, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		// ── 1. INPUT BOX & TEXT INPUT MODAL ────────────────────────────────
		if (stateId === "inputs") {
			return (
				<TuiFrame
					title="Input Box & Text Modal Dialog"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Inline Input Triggers" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="Expression Trigger Token"
									value="^"
									prefix="⚡"
									isFocused={false}
									width={28}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiInput
									label="Password Masked"
									value="mysecretpassword"
									isPassword={true}
									width={26}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider
							label="Single-Line Template Modal Dialog (Open State)"
							theme={theme}
						/>
						<box marginTop={1} marginBottom={1}>
							<TuiInputModal
								title="Date & Time Master Display Template"
								description="Master display template with optional conditional brackets [YYYY[-MM[-DD]]][ HH:min[:SS]]."
								value="[YYYY[-MM[-DD]]][ HH:min[:SS]]"
								previewValue="2026-08-18 01:25:00"
								previewLabel="Live Rendered Timestamp:"
								width={Math.min(62, width - 4)}
								theme={theme}
							/>
						</box>

						<TuiDivider
							label="Multiline Free-Text & Script Scratchpad Modal (Open State)"
							theme={theme}
						/>
						<box marginTop={1}>
							<TuiInputModal
								title="System Assistant Prompt Buffer"
								description="Configure global system instructions and context rules."
								multiline={true}
								value={
									"You are an agentic assistant for Macro CLI.\nAlways prioritize user safety and accuracy.\nValidate syntax tokens before execution."
								}
								activeLineIndex={1}
								instructions={[
									{
										text: "Use line-breaks to format markdown sections.",
										variant: "tip",
									},
									{
										text: "Press Ctrl+Enter to save buffer changes.",
										variant: "info",
									},
								]}
								examples={[
									{
										label: "Standard Assistant",
										sample: "You are a helpful coding assistant.",
										description: "Default profile",
									},
									{
										label: "Clinical Agent",
										sample: "You are an automated clinical macro compiler.",
										description: "Strict safety mode",
									},
								]}
								width={Math.min(62, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 2. DROPDOWNS & QUICKPICK MODAL ─────────────────────────────────
		if (stateId === "dropdowns") {
			return (
				<TuiFrame
					title="Dropdown Selection & Modal Dialog"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed Summary Triggers" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiDropdown
									label="Deployment Region"
									options={REGION_OPTIONS}
									selectedId="us-east"
									width={30}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiDropdown
									label="Pricing Plan"
									options={PLAN_OPTIONS}
									selectedId="pro"
									width={24}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider
							label="Open Command-Palette Modal State"
							theme={theme}
						/>
						<box marginTop={1}>
							<TuiDropdown
								title="Select Deployment Region"
								options={REGION_OPTIONS}
								selectedId="eu-west"
								highlightedIndex={2}
								isOpen={true}
								isFocused={true}
								modalWidth={Math.min(58, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 3. COLOR PICKER & MODAL ───────────────────────────────────────
		if (stateId === "color-picker") {
			return (
				<TuiFrame
					title="Color Picker & Theme Swatch Modal"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed Swatch Trigger" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiColorPicker
								label="Primary Brand Color"
								value="#38bdf8"
								width={32}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Open Color Swatch Modal State" theme={theme} />
						<box marginTop={1}>
							<TuiColorPicker
								label="Editor Background Accent"
								value="#38bdf8"
								isOpen={true}
								width={Math.min(58, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 4. DATE PICKER & CALENDAR MODAL ────────────────────────────────
		if (stateId === "date-picker") {
			return (
				<TuiFrame
					title="Date Picker & Calendar Modal Dialog"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed Date Trigger" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiDatePicker
								label="Release Deadline"
								value={SAMPLE_DATE}
								width={30}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Open Calendar Modal State" theme={theme} />
						<box marginTop={1}>
							<TuiDatePicker
								label="Release Deadline"
								value={SAMPLE_DATE}
								cursorDate={{ year: 2026, month: 8, day: 18 }}
								isOpen={true}
								width={Math.min(56, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 5. SLIDERS & MODAL ────────────────────────────────────────────
		if (stateId === "sliders") {
			return (
				<TuiFrame
					title="Sliders & Numeric Adjustment Modal"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Inline Visual Slider" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiSlider
								label="Memory Allocation"
								value={45}
								min={0}
								max={100}
								step={5}
								unit="%"
								width={36}
								theme={theme}
							/>
						</box>

						<TuiDivider
							label="Open Slider Adjustment Modal State"
							theme={theme}
						/>
						<box marginTop={1}>
							<TuiSlider
								label="Memory Allocation"
								value={45}
								min={0}
								max={100}
								step={5}
								unit="%"
								isOpen={true}
								modalWidth={Math.min(58, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 6. TOGGLES & MODAL ────────────────────────────────────────────
		if (stateId === "toggles") {
			return (
				<TuiFrame
					title="Toggles, Switches & Setting Modal"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Inline Visual Switches" theme={theme} />
						<box flexDirection="column" marginTop={1} marginBottom={1}>
							<TuiToggle
								label="Auto-compile macros on change"
								checked={true}
								theme={theme}
							/>
							<box height={1} />
							<TuiToggle
								label="Enable verbose debug logging"
								checked={false}
								variant="pill"
								theme={theme}
							/>
						</box>

						<TuiDivider
							label="Open Toggle Confirmation Modal State"
							theme={theme}
						/>
						<box marginTop={1}>
							<TuiToggle
								label="Streaming AST Validation"
								description="Continuously compiles and validates AST nodes during background execution."
								checked={true}
								isOpen={true}
								modalWidth={Math.min(58, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 7. TAGS & MODAL ───────────────────────────────────────────────
		if (stateId === "tags") {
			return (
				<TuiFrame
					title="Tag Cloud & Editor Modal"
					width={width}
					showBounds={context.showBounds}
					theme={theme}
				>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Inline Tag Cloud" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiTagInput
								label="Service Labels"
								tags={DEMO_TAGS}
								width={38}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Open Tag Editor Modal State" theme={theme} />
						<box marginTop={1}>
							<TuiTagInput
								label="Service Labels"
								tags={DEMO_TAGS}
								isOpen={true}
								modalWidth={Math.min(58, width - 4)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 8. FORM COMPOSITION ───────────────────────────────────────────
		return (
			<TuiFrame
				title="Form Composition — Deploy Configuration"
				width={width}
				showBounds={context.showBounds}
				theme={theme}
			>
				<box flexDirection="column" padding={1}>
					<box height={1} marginBottom={1}>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							New Deployment ›
						</text>
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{" "}
							Configure service deployment settings (Click any field to edit in
							modal)
						</text>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiInput
								label="Service Name"
								value="api-gateway-v3"
								prefix="⬡"
								width={26}
								theme={theme}
							/>
						</box>
						<box flexDirection="column">
							<TuiInput
								label="Image Tag"
								value="sha256:3a9f12"
								prefix="🐳"
								width={22}
								theme={theme}
							/>
						</box>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiDropdown
								label="Region"
								options={REGION_OPTIONS}
								selectedId="us-east"
								width={26}
								theme={theme}
							/>
						</box>
						<box flexDirection="column">
							<TuiDropdown
								label="Plan"
								options={PLAN_OPTIONS}
								selectedId="pro"
								width={22}
								theme={theme}
							/>
						</box>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiColorPicker
								label="Service Color"
								value="#38bdf8"
								width={26}
								theme={theme}
							/>
						</box>
						<box flexDirection="column">
							<TuiDatePicker
								label="Deploy By"
								value={SAMPLE_DATE}
								width={24}
								theme={theme}
							/>
						</box>
					</box>

					<box marginTop={1}>
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							Tab to move between fields · Enter to open modal editor · Esc to
							dismiss
						</text>
					</box>
				</box>
			</TuiFrame>
		);
	},
};
