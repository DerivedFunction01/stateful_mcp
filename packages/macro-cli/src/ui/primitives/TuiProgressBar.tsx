import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
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

// ─── TASK & TELEMETRY PROGRESS MODAL ──────────────────────────────────

export interface TuiProgressModalProps {
	readonly title?: string;
	readonly taskName: string;
	readonly phase: string;
	readonly progress: number;
	readonly total?: number;
	readonly elapsed?: string;
	readonly rate?: string;
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onClose?: () => void;
}

export function TuiProgressModal({
	title,
	taskName,
	phase,
	progress,
	total = 100,
	elapsed = "4.2s",
	rate = "12.4 MB/s",
	width = 56,
	theme,
	i18n,
	onClose,
}: TuiProgressModalProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const effectiveTitle =
		title ?? translate(i18n, "progress.title", "Active Operation Progress");
	const percent = Math.round((progress / total) * 100);

	return (
		<box
			width={width}
			backgroundColor={c.bgSurface}
			borderStyle="single"
			borderColor={c.borderDefault}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{/* Modal Header */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{effectiveTitle}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{translate(i18n, "palette.dismissHint", "esc")}
				</text>
			</box>

			{/* Task Info */}
			<box height={1} marginBottom={1} flexDirection="row">
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{taskName}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgSecondary}>{phase}</text>
			</box>

			{/* Progress Bar */}
			<box marginBottom={1}>
				<TuiProgressBar
					value={progress}
					total={total}
					width={width - 8}
					theme={theme}
				/>
			</box>

			{/* Metrics */}
			<box height={1} marginBottom={1} flexDirection="row">
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{translate(
						i18n,
						"progress.metrics",
						`Elapsed: ${elapsed} · Transfer Rate: ${rate}`,
						{ elapsed, rate },
					)}
				</text>
				<box flexGrow={1} />
				<text fg={c.accentAmber} attributes={TextAttributes.BOLD}>
					{percent}%
				</text>
			</box>

			{/* Close Action */}
			<box flexDirection="row">
				<box
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					onMouseDown={() => onClose?.()}
				>
					<text fg={c.statusError} attributes={TextAttributes.BOLD}>
						{translate(i18n, "progress.cancel", "Cancel Operation")}
					</text>
				</box>
			</box>
		</box>
	);
}
