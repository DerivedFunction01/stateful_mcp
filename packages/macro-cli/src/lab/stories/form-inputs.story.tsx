import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiFrame } from "../../ui/primitives/TuiFrame";
import { TuiDivider } from "../../ui/primitives/TuiDivider";
import { TuiInput } from "../../ui/primitives/TuiInput";
import { TuiDropdown, type TuiDropdownOption } from "../../ui/primitives/TuiDropdown";
import { TuiColorPicker } from "../../ui/primitives/TuiColorPicker";
import { TuiDatePicker, type TuiDatePickerDate } from "../../ui/primitives/TuiDatePicker";
import { GlobalThemeRegistry } from "../../ui/theme";

// ─── Sample data ──────────────────────────────────────────────────────────────

const REGION_OPTIONS: readonly TuiDropdownOption[] = [
	{ id: "us-east", label: "US East (N. Virginia)", icon: "🌎", meta: "us-e1" },
	{ id: "us-west", label: "US West (Oregon)", icon: "🌎", meta: "us-w2" },
	{ id: "eu-west", label: "EU West (Ireland)", icon: "🌍", meta: "eu-w1" },
	{ id: "eu-central", label: "EU Central (Frankfurt)", icon: "🌍", meta: "eu-c1" },
	{ id: "ap-northeast", label: "AP Northeast (Tokyo)", icon: "🌏", meta: "ap-ne1" },
	{ id: "divider-1", label: "", divider: true },
	{ id: "local", label: "Localhost (dev)", icon: "💻", meta: "local", },
];

const PLAN_OPTIONS: readonly TuiDropdownOption[] = [
	{ id: "free", label: "Free", icon: "◇", meta: "$0/mo" },
	{ id: "pro", label: "Pro", icon: "◈", meta: "$29/mo" },
	{ id: "team", label: "Team", icon: "◉", meta: "$99/mo" },
	{ id: "enterprise", label: "Enterprise", icon: "★", meta: "custom", disabled: true },
];

const SAMPLE_DATE: TuiDatePickerDate = { year: 2025, month: 8, day: 17 };
const RANGE_END: TuiDatePickerDate = { year: 2025, month: 8, day: 24 };

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
		"date-picker-range",
		"date-picker-inline",
		"form-composition",
	],
	render(context) {
		const stateId = context.stateId;
		const width = Math.min(72, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		// ── 1. INPUT BOX VARIANTS ──────────────────────────────────────────
		if (stateId === "inputs") {
			return (
				<TuiFrame title="Input Box — Variants & States" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>

						<TuiDivider label="Bordered Variants" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="API Key"
									value=""
									placeholder="sk-••••••••"
									prefix="🔑"
									isFocused={false}
									width={28}
									theme={theme}
								/>
								<box height={1} />
								<TuiInput
									label="API Key"
									value="sk-abc123def456"
									prefix="🔑"
									isFocused={true}
									cursorPos={13}
									width={28}
									hint="Press Enter to save"
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiInput
									label="Password"
									value="mysecretpassword"
									isPassword={true}
									isFocused={false}
									width={26}
									theme={theme}
								/>
								<box height={1} />
								<TuiInput
									label="Password (Focused)"
									value="mysecretpassword"
									isPassword={true}
									isFocused={true}
									cursorPos={10}
									width={26}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider label="Intent States" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="Username"
									value="denny_lu"
									intent="success"
									hint="✓ Username available"
									width={24}
									theme={theme}
								/>
							</box>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="Email"
									value="not-an-email"
									intent="error"
									hint="✗ Invalid email format"
									width={26}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiInput
									label="Project ID"
									value="proj_12345"
									intent="warning"
									hint="⚠ Deprecated format"
									width={22}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider label="Underline & Filled Variants" theme={theme} />
						<box flexDirection="row" marginTop={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="Search"
									value="macro query"
									variant="underline"
									prefix="🔍"
									isFocused={true}
									width={26}
									theme={theme}
								/>
							</box>
							<box flexDirection="column" marginRight={4}>
								<TuiInput
									label="Filter"
									value=""
									placeholder="type to filter…"
									variant="filled"
									isFocused={false}
									width={24}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiInput
									label="Disabled"
									value="read-only-value"
									disabled={true}
									variant="bordered"
									width={22}
									theme={theme}
								/>
							</box>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 2. DROPDOWN SELECTION VARIANTS ────────────────────────────────
		if (stateId === "dropdowns") {
			return (
				<TuiFrame title="Dropdown Selection — Variants & States" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed State" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiDropdown
									label="Deployment Region"
									options={REGION_OPTIONS}
									selectedId="us-east"
									isFocused={false}
									width={30}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiDropdown
									label="Pricing Plan"
									options={PLAN_OPTIONS}
									isFocused={true}
									width={24}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider label="Open — Region Selector" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiDropdown
								label="Select Region"
								options={REGION_OPTIONS}
								selectedId="eu-west"
								highlightedIndex={2}
								isOpen={true}
								isFocused={true}
								maxVisible={5}
								width={34}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Open — Underline Variant" theme={theme} />
						<box marginTop={1}>
							<TuiDropdown
								label="Plan"
								options={PLAN_OPTIONS}
								selectedId="pro"
								highlightedIndex={1}
								isOpen={true}
								isFocused={true}
								variant="underline"
								width={28}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 3. COLOR PICKER (CLOSED) ───────────────────────────────────────
		if (stateId === "color-picker") {
			return (
				<TuiFrame title="Color Picker — Closed & Open States" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed Triggers" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiColorPicker
									label="Accent Color"
									value="#38bdf8"
									isFocused={false}
									width={30}
									theme={theme}
								/>
							</box>
							<box flexDirection="column" marginRight={4}>
								<TuiColorPicker
									label="Background"
									value="#0d1117"
									isFocused={true}
									width={30}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiColorPicker
									label="Status Color"
									value="#3fb950"
									isFocused={false}
									width={30}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider label="Open — Hue/Saturation/Lightness Sliders" theme={theme} />
						<box marginTop={1}>
							<TuiColorPicker
								label="Primary Accent"
								value="#38bdf8"
								isOpen={true}
								isFocused={true}
								hue={198}
								saturation={92}
								lightness={72}
								width={Math.min(44, width - 8)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 4. DATE PICKER CALENDAR ────────────────────────────────────────
		if (stateId === "date-picker") {
			return (
				<TuiFrame title="Date Picker — Calendar Variants" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Closed Triggers" theme={theme} />
						<box flexDirection="row" marginTop={1} marginBottom={1}>
							<box flexDirection="column" marginRight={4}>
								<TuiDatePicker
									label="Start Date"
									value={SAMPLE_DATE}
									isFocused={false}
									width={30}
									theme={theme}
								/>
							</box>
							<box flexDirection="column">
								<TuiDatePicker
									label="Deadline"
									isFocused={true}
									width={30}
									theme={theme}
								/>
							</box>
						</box>

						<TuiDivider label="Open Calendar — August 2025" theme={theme} />
						<box marginTop={1}>
							<TuiDatePicker
								label="Select Date"
								value={SAMPLE_DATE}
								cursorDate={{ year: 2025, month: 8, day: 21 }}
								isOpen={true}
								isFocused={true}
								width={Math.min(32, width - 8)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 5. DATE PICKER RANGE ───────────────────────────────────────────
		if (stateId === "date-picker-range") {
			return (
				<TuiFrame title="Date Picker — Range Selection" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Date Range Trigger" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiDatePicker
								label="Sprint Window"
								value={SAMPLE_DATE}
								rangeEnd={RANGE_END}
								isFocused={true}
								width={38}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Range Calendar — Aug 17 → Aug 24 Highlighted" theme={theme} />
						<box marginTop={1}>
							<TuiDatePicker
								label="Sprint Window"
								value={SAMPLE_DATE}
								rangeEnd={RANGE_END}
								cursorDate={{ year: 2025, month: 8, day: 22 }}
								isOpen={true}
								isFocused={true}
								width={Math.min(32, width - 8)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 6. DATE PICKER INLINE & SEGMENTS ──────────────────────────────
		if (stateId === "date-picker-inline") {
			return (
				<TuiFrame title="Date Picker — Inline & Segment Variants" width={width} showBounds={context.showBounds} theme={theme}>
					<box flexDirection="column" padding={1}>
						<TuiDivider label="Segments Spin-Box (hjkl ↕ to adjust fields)" theme={theme} />
						<box marginTop={1} marginBottom={1}>
							<TuiDatePicker
								label="Expiry Date"
								value={SAMPLE_DATE}
								variant="segments"
								isFocused={true}
								width={width - 4}
								theme={theme}
							/>
						</box>

						<TuiDivider label="Inline Calendar (always visible)" theme={theme} />
						<box marginTop={1}>
							<TuiDatePicker
								label="Publish Date"
								value={SAMPLE_DATE}
								cursorDate={{ year: 2025, month: 8, day: 17 }}
								variant="inline"
								isFocused={true}
								width={Math.min(32, width - 8)}
								theme={theme}
							/>
						</box>
					</box>
				</TuiFrame>
			);
		}

		// ── 7. FORM COMPOSITION (all combined) ────────────────────────────
		return (
			<TuiFrame title="Form Composition — Deploy Configuration" width={width} showBounds={context.showBounds} theme={theme}>
				<box flexDirection="column" padding={1}>
					<box height={1} marginBottom={1}>
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>New Deployment ›</text>
						<text fg={c.fgDim} attributes={TextAttributes.DIM}> Configure service deployment settings</text>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiInput label="Service Name" value="api-gateway-v3" prefix="⬡" isFocused={true} width={26} theme={theme} />
						</box>
						<box flexDirection="column">
							<TuiInput label="Image Tag" value="sha256:3a9f12" prefix="🐳" width={22} theme={theme} />
						</box>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiDropdown label="Region" options={REGION_OPTIONS} selectedId="us-east" width={26} theme={theme} />
						</box>
						<box flexDirection="column">
							<TuiDropdown label="Plan" options={PLAN_OPTIONS} selectedId="pro" width={22} theme={theme} />
						</box>
					</box>

					<box flexDirection="row" marginBottom={1}>
						<box flexDirection="column" marginRight={4}>
							<TuiColorPicker label="Service Color" value="#38bdf8" width={26} theme={theme} />
						</box>
						<box flexDirection="column">
							<TuiDatePicker label="Deploy By" value={SAMPLE_DATE} width={24} theme={theme} />
						</box>
					</box>

					<box marginTop={1}>
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							Tab to move between fields · Enter to confirm · Esc to cancel
						</text>
					</box>
				</box>
			</TuiFrame>
		);
	},
};
