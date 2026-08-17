import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TuiInputVariant = "underline" | "bordered" | "filled" | "ghost";
export type TuiInputIntent = "default" | "success" | "error" | "warning";

export interface TuiInputProps {
	/** The current text value */
	readonly value: string;
	/** Placeholder shown when value is empty */
	readonly placeholder?: string;
	/** Label rendered above the input */
	readonly label?: string;
	/** Hint rendered below the input (validation message, help text) */
	readonly hint?: string;
	/** Visual variant */
	readonly variant?: TuiInputVariant;
	/** Semantic intent controlling color of borders/accents */
	readonly intent?: TuiInputIntent;
	/** Whether the input currently has keyboard focus */
	readonly isFocused?: boolean;
	/** Whether input is read-only */
	readonly isReadOnly?: boolean;
	/** Whether input is disabled */
	readonly disabled?: boolean;
	/** Password masking: replaces value characters with ● */
	readonly isPassword?: boolean;
	/** Prefix glyph rendered inside the input left edge (e.g. "🔍", "$", "@") */
	readonly prefix?: string;
	/** Suffix glyph rendered inside the input right edge (e.g. "▸", "⌘") */
	readonly suffix?: string;
	/** Cursor character position within the value (0-indexed) */
	readonly cursorPos?: number;
	/** Total visible width of the input field (includes label and borders) */
	readonly width?: number;
	/** Theme override */
	readonly theme?: TuiThemeDefinition;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TuiInput({
	value,
	placeholder = "",
	label,
	hint,
	variant = "bordered",
	intent = "default",
	isFocused = false,
	isReadOnly = false,
	disabled = false,
	isPassword = false,
	prefix,
	suffix,
	cursorPos,
	width = 32,
	theme,
}: TuiInputProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	// Intent-driven accent color
	const intentColor =
		intent === "success"
			? c.statusSuccess
			: intent === "error"
				? c.statusError
				: intent === "warning"
					? c.statusWarning
					: isFocused
						? c.borderActive
						: c.borderDefault;

	const labelFg = disabled
		? c.fgDim
		: intent !== "default"
			? intentColor
			: c.fgSecondary;
	const hintFg =
		intent === "error"
			? c.statusError
			: intent === "success"
				? c.statusSuccess
				: intent === "warning"
					? c.statusWarning
					: c.fgMuted;

	const intentIcon =
		intent === "success"
			? "✓"
			: intent === "error"
				? "✗"
				: intent === "warning"
					? "⚠"
					: isFocused
						? "▸"
						: " ";

	// Mask password value
	const displayValue = isPassword ? "●".repeat(value.length) : value;

	// Visible text content width (subtract prefix, suffix, borders/padding)
	const frameChars = variant === "bordered" ? 2 : 0; // left + right border chars
	const prefixChars = prefix ? prefix.length + 1 : 0;
	const suffixChars = suffix ? suffix.length + 1 : 0;
	const innerWidth = Math.max(
		6,
		width - frameChars - prefixChars - suffixChars - 2 /* inner padding */,
	);

	// Scroll/truncate: keep cursor visible if cursorPos is set
	let visibleText: string;
	if (displayValue.length === 0) {
		visibleText = ""; // show placeholder separately
	} else if (displayValue.length <= innerWidth) {
		visibleText = displayValue;
	} else {
		// Scroll window: keep cursorPos centered
		const cp = cursorPos ?? displayValue.length;
		const start = Math.max(
			0,
			Math.min(
				cp - Math.floor(innerWidth / 2),
				displayValue.length - innerWidth,
			),
		);
		visibleText = displayValue.slice(start, start + innerWidth);
	}
	// Pad to exact inner width so the input box is consistently sized
	const paddedText = visibleText.padEnd(innerWidth, " ");

	// Insert blinking cursor character
	let renderText = paddedText;
	if (isFocused && !disabled && !isReadOnly && cursorPos !== undefined) {
		const cp = cursorPos ?? 0;
		const localPos = Math.min(cp, innerWidth - 1);
		renderText =
			paddedText.slice(0, localPos) +
			(paddedText[localPos] ?? " ") + // cursor sits on top of this char
			paddedText.slice(localPos + 1);
	}

	const textFg = disabled
		? c.fgDim
		: isReadOnly
			? c.fgMuted
			: value.length === 0
				? c.fgDim
				: c.fgPrimary;

	const fieldBg = disabled ? undefined : isFocused ? c.bgElevated : c.bgSurface;

	// ── UNDERLINE VARIANT ────────────────────────────────────────────────────
	if (variant === "underline") {
		const underlineChar = isFocused ? "▔" : "─";
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text
							fg={labelFg}
							attributes={disabled ? TextAttributes.DIM : TextAttributes.BOLD}
						>
							{intentIcon} {label}
						</text>
					</box>
				)}
				<box
					flexDirection="row"
					backgroundColor={fieldBg}
					height={1}
					paddingLeft={1}
					paddingRight={1}
				>
					{prefix && <text fg={intentColor}>{prefix} </text>}
					{value.length === 0 ? (
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{paddedText.slice(0, innerWidth).replace(/./g, " ").trimEnd() ||
								placeholder.slice(0, innerWidth).padEnd(innerWidth)}
						</text>
					) : (
						<text
							fg={isFocused ? c.fgPrimary : textFg}
							attributes={isFocused ? TextAttributes.BOLD : 0}
						>
							{renderText}
						</text>
					)}
					{suffix && <text fg={c.fgMuted}> {suffix}</text>}
				</box>
				<box height={1}>
					<text fg={intentColor}>{underlineChar.repeat(width)}</text>
				</box>
				{hint && (
					<box height={1}>
						<text fg={hintFg} attributes={TextAttributes.DIM}>
							{" "}
							{hint}
						</text>
					</box>
				)}
			</box>
		);
	}

	// ── FILLED VARIANT ───────────────────────────────────────────────────────
	if (variant === "filled") {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text fg={labelFg} attributes={TextAttributes.BOLD}>
							{intentIcon} {label}
						</text>
					</box>
				)}
				<box
					flexDirection="row"
					backgroundColor={isFocused ? c.bgActive : c.bgSurface}
					height={1}
					paddingLeft={1}
					paddingRight={1}
				>
					{prefix && <text fg={intentColor}>{prefix} </text>}
					{value.length === 0 ? (
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{placeholder.slice(0, innerWidth).padEnd(innerWidth)}
						</text>
					) : (
						<text
							fg={isFocused ? c.fgPrimary : textFg}
							attributes={isFocused ? TextAttributes.BOLD : 0}
						>
							{renderText}
						</text>
					)}
					{suffix && <text fg={c.fgMuted}> {suffix}</text>}
				</box>
				{hint && (
					<box height={1}>
						<text fg={hintFg} attributes={TextAttributes.DIM}>
							{" "}
							{hint}
						</text>
					</box>
				)}
			</box>
		);
	}

	// ── GHOST VARIANT ────────────────────────────────────────────────────────
	if (variant === "ghost") {
		return (
			<box flexDirection="column" width={width}>
				{label && (
					<box height={1}>
						<text fg={labelFg}>{label}</text>
					</box>
				)}
				<box flexDirection="row" height={1} paddingLeft={1}>
					{prefix && <text fg={intentColor}>{prefix} </text>}
					{value.length === 0 ? (
						<text fg={c.fgDim} attributes={TextAttributes.DIM}>
							{placeholder.slice(0, innerWidth)}
						</text>
					) : (
						<text fg={textFg}>{renderText}</text>
					)}
					{isFocused && (
						<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
							█
						</text>
					)}
					{suffix && <text fg={c.fgMuted}> {suffix}</text>}
				</box>
				{hint && (
					<box height={1}>
						<text fg={hintFg} attributes={TextAttributes.DIM}>
							{" "}
							{hint}
						</text>
					</box>
				)}
			</box>
		);
	}

	// ── BORDERED VARIANT (Default) ────────────────────────────────────────────
	return (
		<box flexDirection="column" width={width}>
			{label && (
				<box height={1}>
					<text fg={labelFg} attributes={TextAttributes.BOLD}>
						{intentIcon} {label}
					</text>
				</box>
			)}
			<box
				borderStyle="single"
				borderColor={intentColor}
				backgroundColor={fieldBg}
				flexDirection="row"
				paddingLeft={1}
				paddingRight={1}
			>
				{prefix && (
					<text fg={isFocused ? c.accentPrimary : c.fgMuted}>{prefix} </text>
				)}
				{value.length === 0 ? (
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{placeholder.slice(0, innerWidth).padEnd(innerWidth)}
					</text>
				) : (
					<text
						fg={isFocused ? c.fgPrimary : textFg}
						attributes={isFocused ? TextAttributes.BOLD : 0}
					>
						{renderText}
					</text>
				)}
				{suffix && <text fg={c.fgMuted}> {suffix}</text>}
			</box>
			{hint && (
				<box height={1}>
					<text fg={hintFg} attributes={TextAttributes.DIM}>
						{" "}
						{hint}
					</text>
				</box>
			)}
		</box>
	);
}
