import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiButtonVariant =
	| "outline-to-solid"
	| "outline"
	| "solid"
	| "ghost"
	| "pill";
export type TuiButtonIntent =
	| "primary"
	| "secondary"
	| "danger"
	| "success"
	| "warning";

export interface TuiButtonProps {
	readonly label: string;
	readonly icon?: string;
	readonly shortcut?: string;
	readonly variant?: TuiButtonVariant;
	readonly intent?: TuiButtonIntent;
	readonly isSelected?: boolean;
	readonly isFocused?: boolean;
	readonly disabled?: boolean;
	readonly width?: number;
	readonly align?: "left" | "center";
	readonly theme?: TuiThemeDefinition;
}

export function TuiButton({
	label,
	icon,
	shortcut,
	variant = "outline-to-solid",
	intent = "primary",
	isSelected = false,
	isFocused = false,
	disabled = false,
	width,
	align = "center",
	theme,
}: TuiButtonProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const activeState = isFocused || isSelected;

	// Determine intent accent color
	const intentColor =
		intent === "danger"
			? c.statusError
			: intent === "warning"
				? c.statusWarning
				: intent === "success"
					? c.statusSuccess
					: c.accentPrimary;

	const isSemanticIntent =
		intent === "danger" || intent === "success" || intent === "warning";

	if (disabled) {
		if (
			variant === "outline" ||
			variant === "outline-to-solid" ||
			variant === "solid"
		) {
			return (
				<box
					borderStyle="single"
					borderColor={c.borderSubtle}
					backgroundColor={c.bgCanvas}
					paddingLeft={1}
					paddingRight={1}
					width={width}
					justifyContent={align === "center" ? "center" : undefined}
					alignItems="center"
					flexDirection="row"
				>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{icon ? `${icon} ` : ""}
						{label}
						{shortcut ? ` (${shortcut})` : ""}
					</text>
				</box>
			);
		}
		return (
			<text fg={c.fgDim} attributes={TextAttributes.DIM}>
				[ {icon ? `${icon} ` : ""}
				{label} ]
			</text>
		);
	}

	// 1. OUTLINE-TO-SOLID VARIANT (Border when Idle, Solid Inverted Fill when Active)
	if (variant === "outline-to-solid") {
		const borderColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.borderSubtle;

		const textColor = activeState
			? c.fgInverse
			: isSemanticIntent
				? intentColor
				: c.fgMuted;

		const bgColor = activeState ? intentColor : c.bgSurface;

		return (
			<box
				borderStyle="single"
				borderColor={borderColor}
				backgroundColor={bgColor}
				paddingLeft={1}
				paddingRight={1}
				width={width}
				justifyContent={align === "center" ? "center" : undefined}
				alignItems="center"
				flexDirection="row"
			>
				{icon && (
					<text
						fg={textColor}
						attributes={activeState ? TextAttributes.BOLD : 0}
					>
						{icon}{" "}
					</text>
				)}
				<text fg={textColor} attributes={activeState ? TextAttributes.BOLD : 0}>
					{label}
				</text>
				{shortcut && (
					<text
						fg={activeState ? textColor : c.fgDim}
						attributes={activeState ? 0 : TextAttributes.DIM}
					>
						{" "}
						({shortcut})
					</text>
				)}
			</box>
		);
	}

	// 2. OUTLINE (Glowing border when active, dark background)
	if (variant === "outline") {
		const borderColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.borderSubtle;

		const textColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.fgMuted;

		const bgColor = activeState ? c.bgActive : c.bgSurface;

		return (
			<box
				borderStyle="single"
				borderColor={borderColor}
				backgroundColor={bgColor}
				paddingLeft={1}
				paddingRight={1}
				width={width}
				justifyContent={align === "center" ? "center" : undefined}
				alignItems="center"
				flexDirection="row"
			>
				{icon && (
					<text
						fg={textColor}
						attributes={activeState ? TextAttributes.BOLD : 0}
					>
						{icon}{" "}
					</text>
				)}
				<text fg={textColor} attributes={activeState ? TextAttributes.BOLD : 0}>
					{label}
				</text>
				{shortcut && (
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{" "}
						({shortcut})
					</text>
				)}
			</box>
		);
	}

	// 3. SOLID VARIANT (Always solid fill with matching single border)
	if (variant === "solid") {
		const bgColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.bgActive;
		const textColor = activeState
			? c.fgInverse
			: isSemanticIntent
				? c.fgInverse
				: c.fgPrimary;

		return (
			<box
				borderStyle="single"
				borderColor={bgColor}
				backgroundColor={bgColor}
				paddingLeft={1}
				paddingRight={1}
				width={width}
				justifyContent={align === "center" ? "center" : undefined}
				alignItems="center"
				flexDirection="row"
			>
				{icon && (
					<text fg={textColor} attributes={TextAttributes.BOLD}>
						{icon}{" "}
					</text>
				)}
				<text fg={textColor} attributes={TextAttributes.BOLD}>
					{label}
				</text>
				{shortcut && (
					<text fg={textColor} attributes={TextAttributes.DIM}>
						{" "}
						({shortcut})
					</text>
				)}
			</box>
		);
	}

	// 4. PILL VARIANT (Compact Nano-style [ Label ])
	if (variant === "pill") {
		const bracketColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.borderDefault;
		const textColor = activeState
			? intentColor
			: isSemanticIntent
				? intentColor
				: c.fgPrimary;

		return (
			<box flexDirection="row">
				<text fg={bracketColor} attributes={TextAttributes.BOLD}>
					[{" "}
				</text>
				{icon && (
					<text
						fg={textColor}
						attributes={activeState ? TextAttributes.BOLD : 0}
					>
						{icon}{" "}
					</text>
				)}
				<text fg={textColor} attributes={activeState ? TextAttributes.BOLD : 0}>
					{label}
				</text>
				{shortcut && (
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{" "}
						{shortcut}
					</text>
				)}
				<text fg={bracketColor} attributes={TextAttributes.BOLD}>
					{" "}
					]
				</text>
			</box>
		);
	}

	// 5. GHOST / TEXT VARIANT
	const textColor = activeState
		? intentColor
		: isSemanticIntent
			? intentColor
			: c.fgMuted;
	return (
		<box
			flexDirection="row"
			paddingLeft={1}
			paddingRight={1}
			backgroundColor={activeState ? c.bgActive : undefined}
		>
			{icon && (
				<text fg={textColor} attributes={activeState ? TextAttributes.BOLD : 0}>
					{icon}{" "}
				</text>
			)}
			<text fg={textColor} attributes={activeState ? TextAttributes.BOLD : 0}>
				{activeState ? `> ${label}` : label}
			</text>
			{shortcut && (
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{" "}
					({shortcut})
				</text>
			)}
		</box>
	);
}
