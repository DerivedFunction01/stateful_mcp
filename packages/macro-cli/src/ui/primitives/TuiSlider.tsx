import { type MouseEvent, TextAttributes } from "@opentui/core";
import {
	formatNumericValue,
	type NumericFormatOptions,
} from "@stateful-mcp/macro";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── TUI SLIDER ───────────────────────────────────────────────────────────────

export interface TuiSliderProps {
	readonly label?: string;
	readonly value: number;
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	readonly unit?: string;
	readonly width?: number;
	readonly isFocused?: boolean;
	readonly intent?: "primary" | "warning" | "success" | "danger";
	readonly disabled?: boolean;
	readonly theme?: TuiThemeDefinition;
	readonly onChange?: (value: number) => void;
	readonly formatOptions?: NumericFormatOptions;
}

export function TuiSlider({
	label,
	value,
	min = 0,
	max = 100,
	step = 1,
	unit = "%",
	width = 32,
	isFocused = false,
	intent = "primary",
	disabled = false,
	theme,
	onChange,
	formatOptions,
}: TuiSliderProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const intentColor =
		intent === "danger"
			? c.statusError
			: intent === "warning"
				? c.statusWarning
				: intent === "success"
					? c.statusSuccess
					: c.accentPrimary;

	const trackWidth = Math.max(8, width - (label ? 16 : 8));
	const clampedValue = Math.max(min, Math.min(max, value));
	const ratio = (clampedValue - min) / Math.max(1, max - min);
	const thumbPos = Math.round(ratio * (trackWidth - 1));

	// Build the track string
	// Active track before thumb: ━, Thumb: ●, Inactive track after thumb: ─
	const leftTrack = "━".repeat(thumbPos);
	const rightTrack = "─".repeat(Math.max(0, trackWidth - thumbPos - 1));
	const displayValue = `${formatNumericValue(clampedValue, formatOptions)}${unit}`;
	const updateFromPointer = (event: MouseEvent) => {
		if (disabled || (event.button !== 0 && !event.isDragging)) return;
		const ratio = Math.max(
			0,
			Math.min(1, (event.x - 1) / Math.max(1, trackWidth - 1)),
		);
		const raw = min + ratio * (max - min);
		const stepped =
			Math.round(raw / Math.max(step, Number.EPSILON)) *
			Math.max(step, Number.EPSILON);
		onChange?.(Math.max(min, Math.min(max, stepped)));
	};

	return (
		<box flexDirection="column">
			{label && (
				<box height={1} flexDirection="row">
					<text
						fg={disabled ? c.fgDim : isFocused ? c.fgPrimary : c.fgSecondary}
						attributes={isFocused ? TextAttributes.BOLD : 0}
					>
						{label}
					</text>
					<box flexGrow={1} />
					<text
						fg={isFocused ? intentColor : c.fgMuted}
						attributes={TextAttributes.BOLD}
					>
						{displayValue}
					</text>
				</box>
			)}
			<box
				flexDirection="row"
				height={1}
				backgroundColor={isFocused ? c.bgActive : undefined}
				paddingLeft={1}
				paddingRight={1}
				onMouseDown={updateFromPointer}
				onMouseDrag={updateFromPointer}
			>
				<text
					fg={disabled ? c.fgDim : isFocused ? intentColor : c.borderDefault}
				>
					├
				</text>
				<text
					fg={disabled ? c.fgDim : intentColor}
					attributes={TextAttributes.BOLD}
				>
					{leftTrack}
				</text>
				<text
					fg={disabled ? c.fgDim : isFocused ? c.accentAmber : intentColor}
					attributes={TextAttributes.BOLD}
				>
					●
				</text>
				<text fg={disabled ? c.fgDim : c.borderDefault}>{rightTrack}</text>
				<text
					fg={disabled ? c.fgDim : isFocused ? intentColor : c.borderDefault}
				>
					┤
				</text>
				{!label && (
					<text
						fg={isFocused ? intentColor : c.fgMuted}
						attributes={TextAttributes.BOLD}
					>
						{"  "}
						{displayValue}
					</text>
				)}
			</box>
		</box>
	);
}

// ─── TUI RANGE SLIDER ─────────────────────────────────────────────────────────

export interface TuiRangeSliderProps {
	readonly label?: string;
	readonly range: readonly [number, number];
	readonly min?: number;
	readonly max?: number;
	readonly unit?: string;
	readonly width?: number;
	readonly isFocused?: boolean;
	readonly activeThumb?: "start" | "end";
	readonly theme?: TuiThemeDefinition;
	readonly onChange?: (range: readonly [number, number]) => void;
	readonly formatOptions?: NumericFormatOptions;
}

export function TuiRangeSlider({
	label,
	range,
	min = 0,
	max = 100,
	unit = "ms",
	width = 36,
	isFocused = false,
	activeThumb = "end",
	theme,
	onChange,
	formatOptions,
}: TuiRangeSliderProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const trackWidth = Math.max(10, width - (label ? 18 : 10));
	const rangeSpan = Math.max(1, max - min);
	const startRatio = (Math.max(min, Math.min(max, range[0])) - min) / rangeSpan;
	const endRatio = (Math.max(min, Math.min(max, range[1])) - min) / rangeSpan;

	const startPos = Math.round(startRatio * (trackWidth - 1));
	const endPos = Math.max(startPos, Math.round(endRatio * (trackWidth - 1)));

	const preTrack = "─".repeat(startPos);
	const inSpan = "━".repeat(Math.max(0, endPos - startPos - 1));
	const postTrack = "─".repeat(Math.max(0, trackWidth - endPos - 1));
	const displayRange = `${formatNumericValue(range[0], formatOptions)}${unit} - ${formatNumericValue(range[1], formatOptions)}${unit}`;
	const updateFromPointer = (event: MouseEvent) => {
		if (event.button !== 0 && !event.isDragging) return;
		const ratio = Math.max(
			0,
			Math.min(1, (event.x - 1) / Math.max(1, trackWidth - 1)),
		);
		const value = min + ratio * (max - min);
		const next: [number, number] = [...range] as [number, number];
		next[activeThumb === "start" ? 0 : 1] = Math.max(min, Math.min(max, value));
		if (next[0] > next[1]) [next[0], next[1]] = [next[1], next[0]];
		onChange?.(next);
	};

	return (
		<box flexDirection="column">
			{label && (
				<box height={1} flexDirection="row">
					<text
						fg={isFocused ? c.fgPrimary : c.fgSecondary}
						attributes={isFocused ? TextAttributes.BOLD : 0}
					>
						{label}
					</text>
					<box flexGrow={1} />
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{displayRange}
					</text>
				</box>
			)}
			<box
				flexDirection="row"
				height={1}
				backgroundColor={isFocused ? c.bgActive : undefined}
				paddingLeft={1}
				paddingRight={1}
				onMouseDown={updateFromPointer}
				onMouseDrag={updateFromPointer}
			>
				<text fg={c.borderDefault}>├</text>
				<text fg={c.borderDefault}>{preTrack}</text>
				<text
					fg={
						activeThumb === "start" && isFocused
							? c.accentAmber
							: c.accentPrimary
					}
					attributes={TextAttributes.BOLD}
				>
					●
				</text>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{inSpan}
				</text>
				<text
					fg={
						activeThumb === "end" && isFocused ? c.accentAmber : c.accentPrimary
					}
					attributes={TextAttributes.BOLD}
				>
					●
				</text>
				<text fg={c.borderDefault}>{postTrack}</text>
				<text fg={c.borderDefault}>┤</text>
			</box>
		</box>
	);
}
