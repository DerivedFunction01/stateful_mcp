import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiProgressIntent = "primary" | "success" | "warning" | "danger";
export type TuiProgressVariant =
	| "continuous"
	| "blocks"
	| "segmented"
	| "minimal";

export interface TuiProgressBarProps {
	readonly value: number;
	readonly total?: number;
	readonly width?: number;
	readonly variant?: TuiProgressVariant;
	readonly intent?: TuiProgressIntent;
	readonly label?: string;
	readonly showPercentage?: boolean;
	readonly theme?: TuiThemeDefinition;
}

const FRACTIONAL_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

export function TuiProgressBar({
	value,
	total = 100,
	width = 24,
	variant = "continuous",
	intent = "primary",
	label,
	showPercentage = true,
	theme,
}: TuiProgressBarProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const clampedValue = Math.max(0, Math.min(value, total));
	const ratio = total > 0 ? clampedValue / total : 0;
	const percent = Math.round(ratio * 100);

	const fillFg =
		intent === "danger"
			? c.statusError
			: intent === "warning"
				? c.statusWarning
				: intent === "success"
					? c.statusSuccess
					: c.accentPrimary;

	const barWidth = Math.max(4, width);

	let barVisual: string;
	let emptyVisual: string;

	if (variant === "continuous") {
		const totalEighths = Math.round(ratio * barWidth * 8);
		const fullBlocks = Math.floor(totalEighths / 8);
		const remainder = totalEighths % 8;
		const partialBlock = remainder > 0 ? FRACTIONAL_BLOCKS[remainder] : "";
		const emptyCount = Math.max(
			0,
			barWidth - fullBlocks - (remainder > 0 ? 1 : 0),
		);

		barVisual = "█".repeat(fullBlocks) + partialBlock;
		emptyVisual = "░".repeat(emptyCount);
	} else if (variant === "blocks") {
		const fullBlocks = Math.round(ratio * barWidth);
		const emptyCount = Math.max(0, barWidth - fullBlocks);
		barVisual = "█".repeat(fullBlocks);
		emptyVisual = "░".repeat(emptyCount);
	} else if (variant === "segmented") {
		const segments = Math.floor(barWidth / 2);
		const filledSegments = Math.round(ratio * segments);
		const emptySegments = Math.max(0, segments - filledSegments);
		barVisual = "■ ".repeat(filledSegments);
		emptyVisual = "□ ".repeat(emptySegments);
	} else {
		// minimal
		const filled = Math.round(ratio * barWidth);
		const empty = Math.max(0, barWidth - filled);
		barVisual = "━".repeat(filled);
		emptyVisual = "─".repeat(empty);
	}

	return (
		<box flexDirection="column">
			{label && (
				<box height={1} flexDirection="row" marginBottom={0}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{label}
					</text>
					{showPercentage && (
						<>
							<box flexGrow={1} />
							<text fg={fillFg} attributes={TextAttributes.BOLD}>
								{percent}%
							</text>
						</>
					)}
				</box>
			)}
			<box flexDirection="row" height={1}>
				<text fg={fillFg} attributes={TextAttributes.BOLD}>
					{barVisual}
				</text>
				<text fg={c.borderSubtle}>{emptyVisual}</text>
				{!label && showPercentage && (
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{"  "}
						{percent}%
					</text>
				)}
			</box>
		</box>
	);
}

export interface TuiGaugeProps {
	readonly value: number;
	readonly max?: number;
	readonly label?: string;
	readonly filledChar?: string;
	readonly emptyChar?: string;
	readonly intent?: TuiProgressIntent;
	readonly theme?: TuiThemeDefinition;
}

export function TuiGauge({
	value,
	max = 5,
	label,
	filledChar = "■",
	emptyChar = "□",
	intent = "primary",
	theme,
}: TuiGaugeProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const clamped = Math.max(0, Math.min(value, max));
	const empty = Math.max(0, max - clamped);

	const fillFg =
		intent === "danger"
			? c.statusError
			: intent === "warning"
				? c.statusWarning
				: intent === "success"
					? c.statusSuccess
					: c.accentPrimary;

	return (
		<box flexDirection="row" height={1}>
			{label && (
				<text fg={c.fgMuted}>
					{label}
					{"  "}
				</text>
			)}
			<text fg={fillFg} attributes={TextAttributes.BOLD}>
				{(filledChar + " ").repeat(clamped)}
			</text>
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>
				{(emptyChar + " ").repeat(empty)}
			</text>
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>
				{" "}
				{clamped}/{max}
			</text>
		</box>
	);
}
