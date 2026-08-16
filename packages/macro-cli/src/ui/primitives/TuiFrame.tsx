import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { TuiNamedColors } from "../tokens";

export type TuiDimension = number | `${number}%` | "auto";

export interface TuiFrameProps {
	readonly title?: string;
	readonly meta?: string;
	readonly width?: TuiDimension;
	readonly height?: TuiDimension;
	readonly minWidth?: number;
	readonly minHeight?: number;
	readonly borderStyle?: "single" | "rounded" | "double" | "ascii";
	readonly borderColor?: string;
	readonly showBounds?: boolean;
	readonly flexGrow?: number;
	readonly flexDirection?: "row" | "column";
	readonly padding?: number;
	readonly paddingLeft?: number;
	readonly paddingRight?: number;
	readonly paddingTop?: number;
	readonly paddingBottom?: number;
	readonly children?: ReactNode;
}

export function TuiFrame({
	title,
	meta,
	width,
	height,
	minWidth,
	minHeight,
	borderStyle = "single",
	borderColor,
	showBounds = false,
	flexGrow,
	flexDirection = "column",
	padding,
	paddingLeft,
	paddingRight,
	paddingTop,
	paddingBottom,
	children,
}: TuiFrameProps) {
	const resolvedBorderColor = showBounds
		? "magenta"
		: borderColor ?? (borderStyle === "rounded" ? "cyan" : TuiNamedColors.border);

	return (
		<box
			width={width}
			height={height}
			minWidth={minWidth}
			minHeight={minHeight}
			flexGrow={flexGrow}
			flexDirection="column"
			borderStyle={borderStyle === "ascii" ? "single" : borderStyle}
			borderColor={resolvedBorderColor}
		>
			{(title || meta || showBounds) && (
				<box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
					{title && (
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{title}
						</text>
					)}
					{showBounds && (
						<text fg="magenta" attributes={TextAttributes.DIM}>
							{" "}[bounds: {String(width ?? "auto")}×{String(height ?? "auto")}]
						</text>
					)}
					<box flexGrow={1} />
					{meta && (
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{meta}
						</text>
					)}
				</box>
			)}
			<box
				flexGrow={1}
				flexDirection={flexDirection}
				padding={padding}
				paddingLeft={paddingLeft}
				paddingRight={paddingRight}
				paddingTop={paddingTop}
				paddingBottom={paddingBottom}
			>
				{children}
			</box>
		</box>
	);
}
