import { type MouseEvent, TextAttributes } from "@opentui/core";
import {
	formatNumericValue,
	type I18nKernel,
	type NumericFormatOptions,
	translate,
} from "@stateful-mcp/macro";
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
	readonly formatOptions?: NumericFormatOptions;
}

export function TuiBarChart({
	data,
	title,
	maxBarWidth = 24,
	showValues = true,
	theme,
	formatOptions,
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
				const displayVal =
					item.formattedValue ?? formatNumericValue(item.value, formatOptions);

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

// ─── 6. INTERACTIVE CHART DATA EXPLORER MODAL ─────────────────────────

export interface TuiChartModalProps {
	readonly title?: string;
	readonly items: readonly TuiBarChartItem[];
	readonly selectedIndex?: number;
	readonly query?: string;
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onSelectIndex?: (index: number) => void;
	readonly onClose?: () => void;
}

export function TuiChartModal({
	title,
	items,
	selectedIndex = 0,
	query = "",
	width = 64,
	theme,
	i18n,
	onSelectIndex,
	onClose,
}: TuiChartModalProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const totalValue = items.reduce((acc, it) => acc + it.value, 0);
	const maxValue = Math.max(1, ...items.map((it) => it.value));
	const minValue = Math.min(...items.map((it) => it.value));

	const filteredItems = query
		? items.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
		: items;

	const activeItem = filteredItems[selectedIndex] ?? filteredItems[0];
	const activePercent =
		activeItem && totalValue > 0
			? ((activeItem.value / totalValue) * 100).toFixed(1)
			: "0.0";

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
					{title ?? translate(i18n, "chart.title")}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{translate(i18n, "palette.dismissHint")}
				</text>
			</box>

			{/* Filter Query Line */}
			<box height={1} marginBottom={1} flexDirection="row">
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{query}
				</text>
				<text fg={c.accentPrimary}>▎</text>
				<box flexGrow={1} />
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{translate(i18n, "chart.dataPoints", { count: filteredItems.length })}
				</text>
			</box>

			{/* Data Series Bar Grid */}
			<box flexDirection="column" marginBottom={1}>
				{filteredItems.map((item, idx) => {
					const isSelected = idx === selectedIndex;
					const ratio = Math.max(0, item.value) / maxValue;
					const barLen = Math.max(1, Math.round(ratio * 20));
					const barColor = item.color ?? c.accentPrimary;

					return (
						<box
							key={item.label}
							height={1}
							backgroundColor={isSelected ? c.bgSelect : undefined}
							paddingLeft={1}
							paddingRight={1}
							flexDirection="row"
							onMouseDown={(event: MouseEvent) => {
								if (event.button === 0) onSelectIndex?.(idx);
							}}
						>
							<text
								fg={isSelected ? c.bgSelectText : c.fgPrimary}
								attributes={isSelected ? TextAttributes.BOLD : 0}
							>
								{item.label.padEnd(16, " ")}
							</text>
							<text fg={barColor} attributes={TextAttributes.BOLD}>
								{"█".repeat(barLen)}
							</text>
							<box flexGrow={1} />
							<text
								fg={isSelected ? c.bgSelectText : c.fgDim}
								attributes={TextAttributes.DIM}
							>
								{item.formattedValue ?? item.value}
							</text>
						</box>
					);
				})}
			</box>

			{/* Granular Inspection Box */}
			{activeItem && (
				<box
					flexDirection="column"
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					paddingTop={1}
					paddingBottom={1}
					marginBottom={1}
				>
					<box height={1} flexDirection="row">
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							{translate(i18n, "chart.series")} {activeItem.label}
						</text>
						<box flexGrow={1} />
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{translate(i18n, "chart.value")}{" "}
							{activeItem.formattedValue ?? activeItem.value}
						</text>
					</box>
					<box height={1} flexDirection="row">
						<text fg={c.fgSecondary} attributes={TextAttributes.DIM}>
							{translate(i18n, "chart.percent")} {activePercent}% of total
						</text>
						<box flexGrow={1} />
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{translate(i18n, "chart.min")} {minValue} ·{" "}
							{translate(i18n, "chart.max")} {maxValue}
						</text>
					</box>
				</box>
			)}

			{/* Close Action */}
			<box flexDirection="row">
				<box
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					onMouseDown={(event: MouseEvent) => {
						if (event.button === 0) onClose?.();
					}}
				>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{translate(i18n, "modal.cancel")}
					</text>
				</box>
			</box>
		</box>
	);
}
