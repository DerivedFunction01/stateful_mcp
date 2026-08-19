import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiCursor } from "./TuiCursor";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TuiColorPickerProps {
	/** Currently selected color as a hex string e.g. "#38bdf8" */
	readonly value: string;
	/** Label rendered above the picker */
	readonly label?: string;
	/** Whether the picker panel is open */
	readonly isOpen?: boolean;
	/** Whether the control has keyboard focus */
	readonly isFocused?: boolean;
	/** Active hue cursor position 0–359 */
	readonly hue?: number;
	/** Saturation 0–100 */
	readonly saturation?: number;
	/** Lightness/Value 0–100 */
	readonly lightness?: number;
	/** Width of the control */
	readonly width?: number;
	/** Theme override */
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render a compact 40-stop hue spectrum bar using block characters */
function renderHueBar(
	huePos: number,
	barWidth: number,
): { segments: Array<{ char: string; fg: string }> } {
	const stops = [
		"#ff0000",
		"#ff4000",
		"#ff8000",
		"#ffbf00",
		"#ffff00",
		"#80ff00",
		"#00ff00",
		"#00ff80",
		"#00ffff",
		"#0080ff",
		"#0000ff",
		"#8000ff",
		"#ff00ff",
		"#ff0080",
		"#ff0040",
	];
	const segments: Array<{ char: string; fg: string }> = [];
	for (let i = 0; i < barWidth; i++) {
		const stopIdx = Math.floor((i / barWidth) * stops.length);
		const color = stops[stopIdx] ?? "#ffffff";
		const isCursor = Math.round((huePos / 360) * barWidth) === i;
		segments.push({ char: isCursor ? "▼" : "█", fg: color });
	}
	return { segments };
}

/** Render a saturation/lightness swatch preview row */
function renderSwatchRow(
	baseColor: string,
	count: number,
): Array<{ char: string; fg: string }> {
	// We can't do real HSL blending without math libs, so we simulate
	// by showing the color at varying densities using block chars
	const blocks = ["░", "▒", "▓", "█", "▓", "▒", "░"];
	const swatches: Array<{ char: string; fg: string }> = [];
	for (let i = 0; i < count; i++) {
		const blockIdx = Math.floor((i / count) * blocks.length);
		swatches.push({ char: blocks[blockIdx] ?? "█", fg: baseColor });
	}
	return swatches;
}

/** Convert simplified hue (0-359) into a rough hex color string */
function hueToHex(hue: number): string {
	const h = hue % 360;
	const sector = Math.floor(h / 60);
	const f = (h % 60) / 60;
	const t = Math.round(255 * f);
	const q = 255 - t;
	const toHex = (n: number) => n.toString(16).padStart(2, "0");
	if (sector === 0) return `#ff${toHex(t)}00`;
	if (sector === 1) return `#${toHex(q)}ff00`;
	if (sector === 2) return `#00ff${toHex(t)}`;
	if (sector === 3) return `#00${toHex(q)}ff`;
	if (sector === 4) return `#${toHex(t)}00ff`;
	return `#ff00${toHex(q)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TuiColorPicker({
	value,
	label,
	isOpen = false,
	isFocused = false,
	hue = 210,
	saturation = 75,
	lightness = 60,
	width = 36,
	theme,
	i18n,
}: TuiColorPickerProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;
	const hexDisplay = value.toUpperCase().padEnd(7, " ");

	// ── Color Swatch Trigger ──────────────────────────────────────────────────
	const trigger = (
		<box
			borderStyle="single"
			borderColor={borderColor}
			backgroundColor={triggerBg}
			flexDirection="row"
			paddingLeft={1}
			paddingRight={1}
		>
			{/* Live color swatch preview block */}
			<text fg={value}>{"██"}</text>
			<text fg={c.fgMuted}> </text>
			<text
				fg={isFocused ? c.fgPrimary : c.fgSecondary}
				attributes={isFocused ? TextAttributes.BOLD : 0}
			>
				{hexDisplay}
			</text>
			<text fg={c.fgMuted}> </text>
			{/* Paste shortcut hint */}
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>
				[⌘V]{" "}
			</text>
			<text fg={isFocused || isOpen ? c.accentPrimary : c.fgMuted}>
				{isOpen ? "▲" : "▼"}
			</text>
		</box>
	);

	if (!isOpen) {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text
							fg={isFocused ? c.accentPrimary : c.fgSecondary}
							attributes={TextAttributes.BOLD}
						>
							{label}
						</text>
					</box>
				)}
				{trigger}
			</box>
		);
	}

	// ── Expanded Color Picker Modal ───────────────────────────────────────────
	const modalWidth = Math.max(54, width);
	const barWidth = modalWidth - 10;
	const hueBar = renderHueBar(hue, barWidth);
	const hueColor = hueToHex(hue);
	const swatchRow = renderSwatchRow(hueColor, barWidth);

	return (
		<box flexDirection="column" width={modalWidth}>
			{label && (
				<box height={1}>
					<text
						fg={isFocused ? c.accentPrimary : c.fgSecondary}
						attributes={TextAttributes.BOLD}
					>
						{label}
					</text>
				</box>
			)}
			{trigger}

			<box
				flexDirection="column"
				borderStyle="single"
				borderColor={c.borderDefault}
				backgroundColor={c.bgSurface}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				marginTop={1}
			>
				{/* Modal Header: Title + Dismiss Hint */}
				<box height={1} flexDirection="row" marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{translate(i18n, "colorPicker.title")}
					</text>
					<box flexGrow={1} />
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{translate(i18n, "palette.dismissHint")}
					</text>
				</box>

				{/* Hex & Live Preview Input Bar */}
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={value}>{"██ "}</text>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{value.toUpperCase()}
					</text>
					<TuiCursor char=" " theme={theme} />
					<box flexGrow={1} />
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{translate(i18n, "colorPicker.hexPlaceholder")}
					</text>
				</box>

				{/* Preset Color Swatches */}
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={c.fgSecondary} attributes={TextAttributes.DIM}>
						{translate(i18n, "colorPicker.themeColors")}:{" "}
					</text>
					{[
						c.accentPrimary,
						c.accentSecondary,
						c.statusSuccess,
						c.statusWarning,
						c.statusError,
						"#38bdf8",
						"#a78bfa",
						"#fb923c",
					].map((preset) => (
						<text key={preset} fg={preset}>
							{"██ "}
						</text>
					))}
				</box>

				{/* Hue Spectrum Bar */}
				<box height={1} flexDirection="row">
					<text fg={c.fgDim}>Hue: </text>
					{hueBar.segments.map((seg, i) => (
						<text key={i} fg={seg.fg}>
							{seg.char}
						</text>
					))}
				</box>

				{/* Swatch Gradient Row */}
				<box height={1} flexDirection="row" marginTop={1}>
					<text fg={c.fgDim}>Grad: </text>
					{swatchRow.map((s, i) => (
						<text key={i} fg={s.fg}>
							{s.char}
						</text>
					))}
				</box>
			</box>
		</box>
	);
}
