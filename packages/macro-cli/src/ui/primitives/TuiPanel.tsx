import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { TuiNamedColors } from "../tokens";
import type { TuiDimension } from "./TuiFrame";

export interface TuiPanelProps {
	readonly title?: ReactNode;
	readonly subtitle?: ReactNode;
	readonly headerRight?: ReactNode;
	readonly footer?: ReactNode;
	readonly width?: TuiDimension;
	readonly height?: TuiDimension;
	readonly minWidth?: number;
	readonly minHeight?: number;
	readonly flexGrow?: number;
	readonly flexDirection?: "row" | "column";
	readonly padding?: number;
	readonly children?: ReactNode;
}

export function TuiPanel({
	title,
	subtitle,
	headerRight,
	footer,
	width,
	height,
	minWidth,
	minHeight,
	flexGrow,
	flexDirection = "column",
	padding = 0,
	children,
}: TuiPanelProps) {
	return (
		<box
			width={width}
			height={height}
			minWidth={minWidth}
			minHeight={minHeight}
			flexGrow={flexGrow}
			flexDirection="column"
		>
			{(title || subtitle || headerRight) && (
				<box height={1} paddingLeft={padding} paddingRight={padding} flexDirection="row">
					{title && (
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{title}
						</text>
					)}
					{subtitle && (
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{" "}{subtitle}
						</text>
					)}
					<box flexGrow={1} />
					{headerRight && <box>{headerRight}</box>}
				</box>
			)}
			<box flexGrow={1} flexDirection={flexDirection} padding={padding}>
				{children}
			</box>
			{footer && (
				<box height={1} paddingLeft={padding} paddingRight={padding}>
					{footer}
				</box>
			)}
		</box>
	);
}
