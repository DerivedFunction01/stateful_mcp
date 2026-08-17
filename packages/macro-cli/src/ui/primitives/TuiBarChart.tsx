import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── 1. STANDARD HORIZONTAL BAR CHART ─────────────────────────────────

export interface TuiBarChartItem {
	readonly label: string;
	readonly value: number;
	readonly color?: string;
	readonly formattedValue?: string;
}

export interface TuiBarChartProps {
	readonly data: readonly TuiBarChartItem[];
	readonly title?: string;
	readonly maxBarWidth?: number;
	readonly showValues?: boolean;
	readonly theme?: TuiThemeDefinition;
}

export function TuiBarChart({
	data,
	title,
	maxBarWidth = 24,
	showValues = true,
	theme,
}: TuiBarChartProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const maxValue = Math.max(1, ...data.map((d) => d.value));
	const maxLabelLen = Math.max(4, ...data.map((d) => d.label.length));

	return (
		<box flexDirection="column">
			{title && (
				<box height={1} marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{title}
					</text>
				</box>
			)}
			{data.map((item) => {
				const ratio = Math.max(0, item.value) / maxValue;
				const barLen = Math.max(1, Math.round(ratio * maxBarWidth));
				const barStr = "█".repeat(barLen);
				const barColor = item.color ?? c.accentPrimary;
				const padLabel = item.label.padEnd(maxLabelLen, " ");
				const displayVal = item.formattedValue ?? String(item.value);

				return (
					<box key={item.label} flexDirection="row" height={1}>
						<text fg={c.fgMuted}>
							{padLabel}
							{"  "}
						</text>
						<text fg={barColor} attributes={TextAttributes.BOLD}>
							{barStr}
						</text>
						{showValues && (
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{"  "}
								{displayVal}
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}

// ─── 2. STACKED BAR CHART ─────────────────────────────────────────────

export interface TuiStackedSegment {
	readonly label: string;
	readonly value: number;
	readonly color: string;
	readonly char?: string;
}

export interface TuiStackedBarItem {
	readonly label: string;
	readonly segments: readonly TuiStackedSegment[];
}

export interface TuiStackedBarChartProps {
	readonly items: readonly TuiStackedBarItem[];
	readonly totalWidth?: number;
	readonly title?: string;
	readonly showLegend?: boolean;
	readonly theme?: TuiThemeDefinition;
}

export function TuiStackedBarChart({
	items,
	totalWidth = 36,
	title,
	showLegend = true,
	theme,
}: TuiStackedBarChartProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const maxLabelLen = Math.max(4, ...items.map((i) => i.label.length));

	return (
		<box flexDirection="column">
			{title && (
				<box height={1} marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{title}
					</text>
				</box>
			)}
			{items.map((item) => {
				const total =
					item.segments.reduce((acc, s) => acc + Math.max(0, s.value), 0) || 1;
				const maxLabel = item.label.padEnd(maxLabelLen, " ");

				return (
					<box key={item.label} flexDirection="column" marginBottom={1}>
						<box flexDirection="row" height={1}>
							<text fg={c.fgMuted}>
								{maxLabel}
								{"  "}
							</text>
							{item.segments.map((seg, idx) => {
								const segRatio = Math.max(0, seg.value) / total;
								const segLen = Math.max(1, Math.round(segRatio * totalWidth));
								const char = seg.char ?? "█";
								return (
									<text
										key={idx}
										fg={seg.color}
										attributes={TextAttributes.BOLD}
									>
										{char.repeat(segLen)}
									</text>
								);
							})}
						</box>
						{showLegend && (
							<box flexDirection="row" height={1} paddingLeft={maxLabelLen + 2}>
								{item.segments.map((seg, idx) => {
									const pct = Math.round(
										(Math.max(0, seg.value) / total) * 100,
									);
									return (
										<text key={idx} fg={seg.color}>
											{"■ "}
											{seg.label} ({pct}%){"  "}
										</text>
									);
								})}
							</box>
						)}
					</box>
				);
			})}
		</box>
	);
}

// ─── 3. BOX & WHISKERS (BOX PLOT) ─────────────────────────────────────

export interface TuiBoxPlotItem {
	readonly label: string;
	readonly min: number;
	readonly q1: number;
	readonly median: number;
	readonly q3: number;
	readonly max: number;
	readonly unit?: string;
	readonly color?: string;
}

export interface TuiBoxPlotProps {
	readonly items: readonly TuiBoxPlotItem[];
	readonly width?: number;
	readonly title?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiBoxPlot({
	items,
	width = 36,
	title,
	theme,
}: TuiBoxPlotProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const globalMin = Math.min(...items.map((i) => i.min));
	const globalMax = Math.max(...items.map((i) => i.max));
	const range = globalMax - globalMin || 1;
	const maxLabelLen = Math.max(4, ...items.map((i) => i.label.length));

	return (
		<box flexDirection="column">
			{title && (
				<box height={1} marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{title}
					</text>
				</box>
			)}
			{items.map((item) => {
				const padLabel = item.label.padEnd(maxLabelLen, " ");
				const boxColor = item.color ?? c.accentPrimary;

				// Scale positions to character cells
				const posMin = Math.max(
					0,
					Math.round(((item.min - globalMin) / range) * width),
				);
				const posQ1 = Math.max(
					posMin,
					Math.round(((item.q1 - globalMin) / range) * width),
				);
				const posMed = Math.max(
					posQ1,
					Math.round(((item.median - globalMin) / range) * width),
				);
				const posQ3 = Math.max(
					posMed,
					Math.round(((item.q3 - globalMin) / range) * width),
				);
				const posMax = Math.min(
					width,
					Math.max(posQ3, Math.round(((item.max - globalMin) / range) * width)),
				);

				const leftWhisker = "─".repeat(Math.max(0, posQ1 - posMin - 1));
				const leftBox = "█".repeat(Math.max(0, posMed - posQ1 - 1));
				const rightBox = "█".repeat(Math.max(0, posQ3 - posMed - 1));
				const rightWhisker = "─".repeat(Math.max(0, posMax - posQ3 - 1));
				const leading = " ".repeat(posMin);

				return (
					<box key={item.label} flexDirection="column" marginBottom={1}>
						<box flexDirection="row" height={1}>
							<text fg={c.fgMuted}>
								{padLabel}
								{"  "}
							</text>
							<text fg={c.fgDim}>{leading}</text>
							<text fg={c.borderDefault}>├</text>
							<text fg={c.borderDefault}>{leftWhisker}</text>
							<text fg={boxColor} attributes={TextAttributes.BOLD}>
								[
							</text>
							<text fg={boxColor}>{leftBox}</text>
							<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
								|
							</text>
							<text fg={boxColor}>{rightBox}</text>
							<text fg={boxColor} attributes={TextAttributes.BOLD}>
								]
							</text>
							<text fg={c.borderDefault}>{rightWhisker}</text>
							<text fg={c.borderDefault}>┤</text>
						</box>
						<box flexDirection="row" height={1} paddingLeft={maxLabelLen + 2}>
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								min: {item.min}
								{item.unit ?? ""} · med: {item.median}
								{item.unit ?? ""} · max: {item.max}
								{item.unit ?? ""}
							</text>
						</box>
					</box>
				);
			})}
		</box>
	);
}

// ─── 4. HISTOGRAM FREQUENCY DISTRIBUTION ──────────────────────────────

export interface TuiHistogramBin {
	readonly bin: string;
	readonly count: number;
}

export interface TuiHistogramProps {
	readonly bins: readonly TuiHistogramBin[];
	readonly title?: string;
	readonly maxBarWidth?: number;
	readonly color?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiHistogram({
	bins,
	title,
	maxBarWidth = 24,
	color,
	theme,
}: TuiHistogramProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const maxCount = Math.max(1, ...bins.map((b) => b.count));
	const maxLabelLen = Math.max(4, ...bins.map((b) => b.bin.length));
	const barColor = color ?? c.accentPrimary;

	return (
		<box flexDirection="column">
			{title && (
				<box height={1} marginBottom={1}>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{title}
					</text>
				</box>
			)}
			{bins.map((bin) => {
				const ratio = bin.count / maxCount;
				const barLen = Math.max(0, Math.round(ratio * maxBarWidth));
				const padLabel = bin.bin.padEnd(maxLabelLen, " ");

				return (
					<box key={bin.bin} flexDirection="row" height={1}>
						<text fg={c.fgMuted}>
							{padLabel}
							{"  "}
						</text>
						<text fg={c.borderDefault}>│ </text>
						<text fg={barColor} attributes={TextAttributes.BOLD}>
							{"█".repeat(barLen)}
						</text>
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{" "}
							({bin.count})
						</text>
					</box>
				);
			})}
		</box>
	);
}

// ─── 5. SPARKLINE ─────────────────────────────────────────────────────

const SPARK_CHARS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export interface TuiSparklineProps {
	readonly values: readonly number[];
	readonly label?: string;
	readonly color?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiSparkline({
	values,
	label,
	color,
	theme,
}: TuiSparklineProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const sparkColor = color ?? c.accentPrimary;

	if (values.length === 0) {
		return <text fg={c.fgDim}>[no data]</text>;
	}

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;

	const sparkChars = values
		.map((val) => {
			const norm = (val - min) / range;
			const idx = Math.min(
				SPARK_CHARS.length - 1,
				Math.round(norm * (SPARK_CHARS.length - 1)),
			);
			return SPARK_CHARS[idx];
		})
		.join("");

	return (
		<box flexDirection="row" height={1}>
			{label && <text fg={c.fgMuted}>{label} </text>}
			<text fg={sparkColor} attributes={TextAttributes.BOLD}>
				{sparkChars}
			</text>
		</box>
	);
}
