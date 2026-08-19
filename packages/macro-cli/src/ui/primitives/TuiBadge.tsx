import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── GENERAL BADGE TYPES ──────────────────────────────────────────────────────

export type TuiBadgeIntent =
	| "primary"
	| "success"
	| "warning"
	| "error"
	| "info"
	| "muted"
	| "amber"
	| "peach";

export type TuiBadgeStyle = "text" | "bracketed" | "solid" | "outline" | "pill";

export interface TuiBadgeProps {
	readonly label: ReactNode;
	readonly icon?: string;
	readonly intent?: TuiBadgeIntent;
	readonly style?: TuiBadgeStyle;
	readonly bold?: boolean;
	readonly bracketed?: boolean;
	readonly theme?: TuiThemeDefinition;
}

// ─── GENERAL TUI BADGE ────────────────────────────────────────────────────────

export function TuiBadge({
	label,
	icon,
	intent = "primary",
	style = "bracketed",
	bold = false,
	bracketed = false,
	theme,
}: TuiBadgeProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	let intentColor: string = c.accentPrimary;
	switch (intent) {
		case "success":
			intentColor = c.statusSuccess;
			break;
		case "warning":
			intentColor = c.statusWarning;
			break;
		case "error":
			intentColor = c.statusError;
			break;
		case "info":
			intentColor = c.statusInfo;
			break;
		case "amber":
			intentColor = c.accentAmber;
			break;
		case "peach":
			intentColor = c.accentPeach;
			break;
		case "muted":
			intentColor = c.fgMuted;
			break;
		default:
			intentColor = c.accentPrimary;
			break;
	}

	const iconPrefix = icon ? `${icon} ` : "";
	const effectiveStyle = bracketed ? "bracketed" : style;

	if (effectiveStyle === "solid") {
		return (
			<box backgroundColor={intentColor} paddingLeft={1} paddingRight={1}>
				<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
					{iconPrefix}
					{label}
				</text>
			</box>
		);
	}

	if (effectiveStyle === "outline") {
		return (
			<box
				borderStyle="single"
				borderColor={intentColor}
				paddingLeft={1}
				paddingRight={1}
			>
				<text fg={intentColor} attributes={bold ? TextAttributes.BOLD : 0}>
					{iconPrefix}
					{label}
				</text>
			</box>
		);
	}

	if (effectiveStyle === "pill") {
		return (
			<box flexDirection="row">
				<text fg={intentColor} attributes={TextAttributes.BOLD}>
					( {iconPrefix}
					{label} )
				</text>
			</box>
		);
	}

	if (effectiveStyle === "bracketed") {
		return (
			<box flexDirection="row">
				<text fg={intentColor} attributes={bold ? TextAttributes.BOLD : 0}>
					[ {iconPrefix}
					{label} ]
				</text>
			</box>
		);
	}

	return (
		<text fg={intentColor} attributes={bold ? TextAttributes.BOLD : 0}>
			{iconPrefix}
			{label}
		</text>
	);
}

// ─── STATUS BADGE (GLYPHS, AUDIT STATES & I18N) ───────────────────────────────

export type TuiStatusType =
	| "committed"
	| "reversed"
	| "superseded"
	| "pending"
	| "executing"
	| "failed"
	| "success"
	| "warning"
	| "error"
	| "info";

export type TuiStatusBadgeVariant =
	| "solid-glyph" // " ✓ " with solid background (ultra-compact wordless chip)
	| "solid-pill" // "▌✓▐" with solid pill background
	| "glyph-only" // "✓" / "↺" / "⊘" / "⚡" / "✗"
	| "bracket-glyph" // "[✓]" / "[↺]" / "[⊘]" / "[⚡]" / "[✗]"
	| "outline-glyph" // "[✓]" with outline border
	| "dot-label" // "● committed"
	| "icon-label" // "✓ committed"
	| "solid-chip" // "[ ✓ committed ]" with solid background
	| "outline-chip" // Single-border box with glyph & label
	| "bracketed"; // "[ committed ]"

export interface TuiStatusBadgeProps {
	readonly status: TuiStatusType;
	readonly variant?: TuiStatusBadgeVariant;
	readonly labelOverride?: string;
	readonly uppercase?: boolean;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
}

export function getStatusMeta(status: TuiStatusType): {
	glyph: string;
	i18nKey: string;
	colorKey:
		| "statusSuccess"
		| "statusWarning"
		| "statusError"
		| "statusInfo"
		| "accentAmber"
		| "accentPeach"
		| "fgMuted"
		| "accentPrimary";
} {
	switch (status) {
		case "committed":
		case "success":
			return {
				glyph: "✓",
				i18nKey: "status.committed",
				colorKey: "statusSuccess",
			};
		case "reversed":
			return {
				glyph: "↺",
				i18nKey: "status.reversed",
				colorKey: "accentPeach",
			};
		case "superseded":
			return {
				glyph: "⊘",
				i18nKey: "status.superseded",
				colorKey: "fgMuted",
			};
		case "executing":
			return {
				glyph: "⚡",
				i18nKey: "status.executing",
				colorKey: "accentAmber",
			};
		case "pending":
			return {
				glyph: "◷",
				i18nKey: "status.pending",
				colorKey: "statusInfo",
			};
		case "failed":
		case "error":
			return {
				glyph: "✗",
				i18nKey: "status.failed",
				colorKey: "statusError",
			};
		case "warning":
			return {
				glyph: "⚠",
				i18nKey: "status.warning",
				colorKey: "statusWarning",
			};
		case "info":
			return {
				glyph: "ℹ",
				i18nKey: "status.info",
				colorKey: "statusInfo",
			};
	}
}

export function TuiStatusBadge({
	status,
	variant = "icon-label",
	labelOverride,
	uppercase = false,
	theme,
	i18n,
}: TuiStatusBadgeProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const meta = getStatusMeta(status);
	const color = c[meta.colorKey];

	const rawLabel = labelOverride ?? translate(i18n, meta.i18nKey);
	const labelText = uppercase ? rawLabel.toUpperCase() : rawLabel;

	// 1. Solid Glyph Chip without Words (" ✓ " on solid color block)
	if (variant === "solid-glyph") {
		return (
			<box backgroundColor={color} paddingLeft={1} paddingRight={1}>
				<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
					{meta.glyph}
				</text>
			</box>
		);
	}

	// 2. Pill Glyph ("( ✓ )" or "[ ✓ ]")
	if (variant === "solid-pill") {
		return (
			<box flexDirection="row">
				<text fg={color} attributes={TextAttributes.BOLD}>
					( {meta.glyph} )
				</text>
			</box>
		);
	}

	// 3. Glyph Only ("✓" / "↺" / "⊘" / "⚡" / "✗")
	if (variant === "glyph-only") {
		return (
			<text fg={color} attributes={TextAttributes.BOLD}>
				{meta.glyph}
			</text>
		);
	}

	// 4. Bracket Glyph ("[✓]" / "[↺]" / "[⊘]")
	if (variant === "bracket-glyph") {
		return (
			<box flexDirection="row">
				<text fg={c.fgDim}>[</text>
				<text fg={color} attributes={TextAttributes.BOLD}>
					{meta.glyph}
				</text>
				<text fg={c.fgDim}>]</text>
			</box>
		);
	}

	// 5. Outline Glyph (single border box around glyph)
	if (variant === "outline-glyph") {
		return (
			<box
				borderStyle="single"
				borderColor={color}
				paddingLeft={0}
				paddingRight={0}
			>
				<text fg={color} attributes={TextAttributes.BOLD}>
					{meta.glyph}
				</text>
			</box>
		);
	}

	// 6. Dot Indicator + Label ("● committed")
	if (variant === "dot-label") {
		return (
			<box flexDirection="row">
				<text fg={color} attributes={TextAttributes.BOLD}>
					●{" "}
				</text>
				<text fg={color} attributes={TextAttributes.BOLD}>
					{labelText}
				</text>
			</box>
		);
	}

	// 7. Icon + Label ("✓ committed" / "↺ reversed")
	if (variant === "icon-label") {
		return (
			<box flexDirection="row">
				<text fg={color} attributes={TextAttributes.BOLD}>
					{meta.glyph}{" "}
				</text>
				<text fg={color} attributes={TextAttributes.BOLD}>
					{labelText}
				</text>
			</box>
		);
	}

	// 8. Solid Chip Box with Label ("[ ✓ committed ]")
	if (variant === "solid-chip") {
		return (
			<box backgroundColor={color} paddingLeft={1} paddingRight={1}>
				<text fg={c.fgInverse} attributes={TextAttributes.BOLD}>
					{meta.glyph} {labelText}
				</text>
			</box>
		);
	}

	// 9. Outline Box with Label
	if (variant === "outline-chip") {
		return (
			<box
				borderStyle="single"
				borderColor={color}
				paddingLeft={1}
				paddingRight={1}
			>
				<text fg={color} attributes={TextAttributes.BOLD}>
					{meta.glyph} {labelText}
				</text>
			</box>
		);
	}

	// 10. Bracketed Text ("[ committed ]")
	return (
		<box flexDirection="row">
			<text fg={c.fgDim}>[ </text>
			<text fg={color} attributes={TextAttributes.BOLD}>
				{labelText}
			</text>
			<text fg={c.fgDim}> ]</text>
		</box>
	);
}
