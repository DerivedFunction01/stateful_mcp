import type { ReactNode } from "react";
import { TuiDivider } from "../primitives/TuiDivider";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiLayoutMetrics } from "../tokens";
import { resolveTuiWorkspaceLayout } from "./layout";

export interface TuiWorkspaceSurfaceLayout {
	readonly outerPadding?: number;
	readonly bodyFrame?: "none" | "subtle" | "focused";
	readonly showHeaderDivider?: boolean;
	readonly compact?: boolean;
	readonly activityWidth?: number;
	readonly inspectorWidth?: number;
	readonly activityOpen?: boolean;
	readonly inspectorOpen?: boolean;
}

export interface TuiWorkspaceSurfaceProps {
	readonly header?: ReactNode;
	readonly startRegion?: ReactNode;
	readonly body: ReactNode;
	readonly endRegion?: ReactNode;
	readonly footer?: ReactNode;
	readonly width: number;
	readonly height?: number;
	readonly layout?: TuiWorkspaceSurfaceLayout;
	readonly theme?: TuiThemeDefinition;
}

export function TuiWorkspaceSurface({
	header,
	startRegion,
	body,
	endRegion,
	footer,
	width,
	height,
	layout,
	theme,
}: TuiWorkspaceSurfaceProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const outerPadding = layout?.outerPadding ?? 0;
	const resolvedLayout = resolveTuiWorkspaceLayout({
		width,
		activityWidth: layout?.activityWidth,
		inspectorWidth: layout?.inspectorWidth,
		activityOpen: layout?.activityOpen ?? Boolean(startRegion),
		inspectorOpen: layout?.inspectorOpen ?? Boolean(endRegion),
		outerPadding,
	});
	const bodyFrame = layout?.bodyFrame ?? "none";
	const bodyBorderColor =
		bodyFrame === "focused" ? c.borderActive : c.borderSubtle;

	return (
		<box
			flexDirection="column"
			width={width}
			height={height ?? "100%"}
			backgroundColor={c.bgCanvas}
			padding={outerPadding}
		>
			{header && (
				<box flexDirection="column">
					<box backgroundColor={c.bgSurface} height={1}>
						{header}
					</box>
					{layout?.showHeaderDivider !== false && (
						<TuiDivider
							style="upper"
							length={Math.max(0, resolvedLayout.outerWidth)}
							theme={theme}
						/>
					)}
				</box>
			)}

			<box
				flexGrow={1}
				flexDirection="row"
				minHeight={TuiLayoutMetrics.minContentHeight}
			>
				{startRegion && (
					<box marginRight={TuiLayoutMetrics.regionGap}>{startRegion}</box>
				)}
				<box
					flexGrow={1}
					minWidth={TuiLayoutMetrics.minStageWidth}
					flexDirection="column"
					backgroundColor={bodyFrame === "none" ? undefined : c.bgElevated}
					borderStyle={bodyFrame === "none" ? undefined : "single"}
					borderColor={bodyFrame === "none" ? undefined : bodyBorderColor}
					paddingLeft={bodyFrame === "none" ? 0 : 1}
					paddingRight={bodyFrame === "none" ? 0 : 1}
				>
					{body}
				</box>
				{endRegion && (
					<box marginLeft={TuiLayoutMetrics.regionGap}>{endRegion}</box>
				)}
			</box>

			{footer}
		</box>
	);
}

export type { TuiWorkspaceLayoutResult } from "./layout";
