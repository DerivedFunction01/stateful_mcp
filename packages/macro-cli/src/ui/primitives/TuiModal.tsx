import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { TuiColors, TuiNamedColors } from "../tokens";

export interface TuiModalProps {
	readonly title?: string;
	readonly dismissHint?: string;
	readonly width?: number;
	readonly height?: number;
	readonly borderColor?: string;
	readonly borderStyle?: "single" | "rounded" | "double" | "none";
	readonly backgroundColor?: string;
	readonly children?: ReactNode;
	readonly footer?: ReactNode;
}

export function TuiModal({
	title,
	dismissHint = "esc",
	width = 64,
	height,
	borderColor,
	borderStyle = "none",
	backgroundColor = TuiColors.bgSurface,
	children,
	footer,
}: TuiModalProps) {
	return (
		<box
			width={width}
			height={height}
			borderStyle={borderStyle === "none" ? undefined : borderStyle}
			borderColor={borderColor}
			backgroundColor={backgroundColor}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{(title || dismissHint) && (
				<box height={1} flexDirection="row" marginBottom={1}>
					{title && (
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{title}
						</text>
					)}
					<box flexGrow={1} />
					{dismissHint && (
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{dismissHint}
						</text>
					)}
				</box>
			)}
			<box flexGrow={1} flexDirection="column">
				{children}
			</box>
			{footer && (
				<box height={1} marginTop={1}>
					{footer}
				</box>
			)}
		</box>
	);
}
