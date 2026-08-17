import { TuiLayoutMetrics } from "../tokens";

export interface TuiWorkspaceLayoutInput {
	readonly width: number;
	readonly activityWidth?: number;
	readonly inspectorWidth?: number;
	readonly activityOpen?: boolean;
	readonly inspectorOpen?: boolean;
	readonly outerPadding?: number;
}

export interface TuiWorkspaceLayoutResult {
	readonly mode: "wide" | "medium" | "narrow";
	readonly activityWidth: number;
	readonly inspectorWidth: number;
	readonly bodyWidth: number;
	readonly outerWidth: number;
	readonly compactRails: boolean;
}

export function resolveTuiWorkspaceLayout({
	width,
	activityWidth = TuiLayoutMetrics.defaultActivityWidth,
	inspectorWidth = TuiLayoutMetrics.defaultInspectorWidth,
	activityOpen = true,
	inspectorOpen = true,
	outerPadding = 0,
}: TuiWorkspaceLayoutInput): TuiWorkspaceLayoutResult {
	const safeWidth = Math.max(0, Math.floor(width));
	const outerWidth = Math.max(0, safeWidth - outerPadding * 2);
	const mode =
		safeWidth < TuiLayoutMetrics.narrowTerminalWidth
			? "narrow"
			: safeWidth < TuiLayoutMetrics.mediumTerminalWidth
				? "medium"
				: "wide";
	const compactRails = mode === "narrow";
	const resolvedActivityWidth = activityOpen
		? clampPanelWidth(activityWidth, mode, TuiLayoutMetrics.minActivityWidth)
		: 0;
	const resolvedInspectorWidth = inspectorOpen
		? clampPanelWidth(inspectorWidth, mode, TuiLayoutMetrics.minInspectorWidth)
		: 0;
	const regionGaps =
		(activityOpen ? TuiLayoutMetrics.regionGap : 0) +
		(inspectorOpen ? TuiLayoutMetrics.regionGap : 0);
	const bodyWidth = Math.max(
		0,
		outerWidth - resolvedActivityWidth - resolvedInspectorWidth - regionGaps,
	);

	return {
		mode,
		activityWidth: resolvedActivityWidth,
		inspectorWidth: resolvedInspectorWidth,
		bodyWidth,
		outerWidth,
		compactRails,
	};
}

function clampPanelWidth(
	width: number,
	mode: TuiWorkspaceLayoutResult["mode"],
	minimum: number,
): number {
	const requested = Math.max(minimum, Math.floor(width));
	if (mode === "narrow") return TuiLayoutMetrics.compactRailWidth;
	if (mode === "medium") return Math.max(minimum, Math.min(requested, 32));
	return requested;
}
