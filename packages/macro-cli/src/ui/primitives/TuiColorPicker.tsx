import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render a compact 40-stop hue spectrum bar using block characters */
function renderHueBar(huePos: number, barWidth: number): { segments: Array<{ char: string; fg: string }> } {
	const stops = [
		"#ff0000", "#ff4000", "#ff8000", "#ffbf00", "#ffff00",
		"#80ff00", "#00ff00", "#00ff80", "#00ffff", "#0080ff",
		"#0000ff", "#8000ff", "#ff00ff", "#ff0080", "#ff0040",
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
function renderSwatchRow(baseColor: string, count: number): Array<{ char: string; fg: string }> {
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
}: TuiColorPickerProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;
	const hexDisplay = value.toUpperCase().padEnd(7, " ");

	// ── Color Swatch Trigger ──────────────────────────────────────────────────
	const swatchWidth = 3; // "███" block
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
			<text fg={isFocused ? c.fgPrimary : c.fgSecondary} attributes={isFocused ? TextAttributes.BOLD : 0}>
				{hexDisplay}
			</text>
			<text fg={c.fgMuted}> </text>
			{/* Paste shortcut hint */}
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>[⌘V] </text>
			<text fg={isFocused || isOpen ? c.accentPrimary : c.fgMuted}>{isOpen ? "▲" : "▼"}</text>
		</box>
	);

	if (!isOpen) {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text fg={isFocused ? c.accentPrimary : c.fgSecondary} attributes={TextAttributes.BOLD}>
							{label}
						</text>
					</box>
				)}
				{trigger}
			</box>
		);
	}

	// ── Open Picker Panel ─────────────────────────────────────────────────────
	const barWidth = Math.max(12, width - 4);
	const hueBar = renderHueBar(hue, barWidth);
	const hueColor = hueToHex(hue);
	const swatchRow = renderSwatchRow(hueColor, barWidth);

	// Saturation track: ░░░░▒▒▒▒▓▓▓▓████  with cursor
	const satPos = Math.round((saturation / 100) * barWidth);
	// Lightness track
	const litPos = Math.round((lightness / 100) * barWidth);

	return (
		<box flexDirection="column" width={width}>
			{label && (
				<box height={1}>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>{label}</text>
				</box>
			)}
			{trigger}

			{/* Picker Panel */}
			<box
				flexDirection="column"
				borderStyle="single"
				borderColor={c.borderActive}
				backgroundColor={c.bgElevated}
				paddingLeft={1}
				paddingRight={1}
				paddingTop={0}
				paddingBottom={0}
				width={width}
			>
				{/* Hue Title */}
				<box height={1} marginTop={0}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>Hue  </text>
					<text fg={hueColor} attributes={TextAttributes.BOLD}>{hue}°</text>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>  ← → to adjust</text>
				</box>

				{/* Hue Spectrum Bar */}
				<box height={1}>
					{hueBar.segments.map((seg, i) => (
						<text key={i} fg={seg.fg}>{seg.char}</text>
					))}
				</box>

				{/* Saturation track */}
				<box height={1} marginTop={0}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>Sat  </text>
					<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>{saturation}%</text>
				</box>
				<box height={1}>
					{Array.from({ length: barWidth }, (_, i) => {
						const isCursor = i === satPos;
						const density = i / barWidth;
						const char = density < 0.25 ? "░" : density < 0.5 ? "▒" : density < 0.75 ? "▓" : "█";
						return (
							<text key={i} fg={isCursor ? c.fgPrimary : hueColor} attributes={isCursor ? TextAttributes.BOLD : 0}>
								{isCursor ? "▼" : char}
							</text>
						);
					})}
				</box>

				{/* Lightness track */}
				<box height={1} marginTop={0}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>Lit  </text>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>{lightness}%</text>
				</box>
				<box height={1}>
					{Array.from({ length: barWidth }, (_, i) => {
						const isCursor = i === litPos;
						const density = i / barWidth;
						const char = density < 0.33 ? "░" : density < 0.66 ? "▒" : "█";
						return (
							<text key={i} fg={isCursor ? c.fgPrimary : hueColor} attributes={isCursor ? TextAttributes.BOLD : 0}>
								{isCursor ? "▼" : char}
							</text>
						);
					})}
				</box>

				{/* Swatch Preview Row */}
				<box height={1} marginTop={0}>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>Gradient preview: </text>
				</box>
				<box height={1}>
					{swatchRow.map((s, i) => (
						<text key={i} fg={s.fg}>{s.char}</text>
					))}
				</box>

				{/* Hex & Preset Swatches */}
				<box height={1} marginTop={0} flexDirection="row">
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>Hex: </text>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>{value.toUpperCase()}</text>
					<text fg={c.fgDim}> · </text>
					{/* Quick preset color swatches */}
					{["#ff0000", "#00ff80", "#38bdf8", "#ffd866", "#c084fc"].map((preset) => (
						<text key={preset} fg={preset}>{"█"}</text>
					))}
				</box>

				{/* Footer help */}
				<box height={1}>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						↑↓ Hue  ←→ Sat/Lit  Tab Switch  Enter Apply  Esc Dismiss
					</text>
				</box>
			</box>
		</box>
	);
}
