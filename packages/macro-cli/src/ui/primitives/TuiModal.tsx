import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiModalVariant = "dialog" | "alert" | "card";

export interface TuiModalProps {
	readonly title?: string;
	readonly icon?: string;
	readonly subtitle?: string;
	readonly dismissHint?: string;
	readonly variant?: TuiModalVariant;
	readonly width?: number;
	readonly height?: number;
	readonly borderColor?: string;
	readonly borderStyle?: "single" | "rounded" | "double" | "none";
	readonly backgroundColor?: string;
	readonly showDivider?: boolean;
	readonly children?: ReactNode;
	readonly footer?: ReactNode;
	readonly theme?: TuiThemeDefinition;
}

export function TuiModal({
	title,
	icon,
	subtitle,
	dismissHint = "Esc",
	variant = "dialog",
	width = 62,
	height,
	borderColor,
	borderStyle = "single",
	backgroundColor,
	showDivider = true,
	children,
	footer,
	theme,
}: TuiModalProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const resolvedBorderColor =
		borderColor ?? (variant === "alert" ? c.statusError : c.borderActive);

	const activeBg = backgroundColor ?? c.bgSurface;
	const innerWidth = width - 6;

	return (
		<box
			width={width}
			height={height}
			borderStyle={borderStyle === "none" ? undefined : borderStyle}
			borderColor={resolvedBorderColor}
			backgroundColor={activeBg}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{/* Header Strip */}
			{(title || dismissHint) && (
				<box height={1} flexDirection="row" marginBottom={subtitle ? 0 : 0}>
					{icon && (
						<text
							fg={variant === "alert" ? c.statusError : c.accentPrimary}
							attributes={TextAttributes.BOLD}
						>
							{icon}{" "}
						</text>
					)}
					{title && (
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{title}
						</text>
					)}
					<box flexGrow={1} />
					{dismissHint && (
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{dismissHint}
						</text>
					)}
				</box>
			)}

			{/* Subtitle */}
			{subtitle && (
				<box height={1} marginBottom={0}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{subtitle}
					</text>
				</box>
			)}

			{/* Subtle Header Divider Rule */}
			{showDivider && (title || subtitle) && (
				<box height={1} marginTop={1} marginBottom={1}>
					<text fg={c.borderSubtle}>
						{"─".repeat(Math.max(10, innerWidth))}
					</text>
				</box>
			)}

			{/* Modal Body */}
			<box flexGrow={1} flexDirection="column">
				{children}
			</box>

			{/* Modal Footer / Action Buttons */}
			{footer && (
				<box flexDirection="column" marginTop={1}>
					{showDivider && (
						<box height={1} marginBottom={1}>
							<text fg={c.borderSubtle}>
								{"─".repeat(Math.max(10, innerWidth))}
							</text>
						</box>
					)}
					<box
						flexDirection="row"
						justifyContent="flex-end"
						alignItems="center"
					>
						{footer}
					</box>
				</box>
			)}
		</box>
	);
}
