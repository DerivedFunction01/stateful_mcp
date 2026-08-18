import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
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
	readonly onFocus?: () => void;
	readonly onPointerPosition?: (position: number) => void;
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
	onFocus,
	onPointerPosition,
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
	const handlePointer = (event: MouseEvent) => {
		if (event.button !== 0 || disabled) return;
		onFocus?.();
		onPointerPosition?.(
			Math.max(0, Math.min(value.length, Math.floor(event.x))),
		);
	};

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
			<box flexDirection="column" width={width} onMouseDown={handlePointer}>
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
			<box flexDirection="column" width={width} onMouseDown={handlePointer}>
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
			<box flexDirection="column" width={width} onMouseDown={handlePointer}>
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
		<box flexDirection="column" width={width} onMouseDown={handlePointer}>
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

// ─── TEXT & FORMAT TEMPLATE INPUT MODAL ───────────────────────────────

export interface TuiEditorInstruction {
	readonly text: string;
	readonly variant?: "info" | "tip" | "warning";
}

export interface TuiEditorExampleHint {
	readonly label: string;
	readonly sample: string;
	readonly description?: string;
}

export interface TuiInputModalProps {
	readonly title?: string;
	readonly description?: string;
	readonly value: string;
	readonly placeholder?: string;
	readonly multiline?: boolean;
	readonly instructions?: readonly TuiEditorInstruction[];
	readonly examples?: readonly TuiEditorExampleHint[];
	readonly activeLineIndex?: number;
	readonly previewValue?: string;
	readonly previewLabel?: string;
	readonly width?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onConfirm?: () => void;
	readonly onCancel?: () => void;
	readonly onResetDefault?: () => void;
}

export function TuiInputModal({
	title,
	description,
	value,
	placeholder,
	multiline = false,
	instructions,
	examples,
	activeLineIndex = 0,
	previewValue,
	previewLabel,
	width = 62,
	theme,
	i18n,
	onConfirm,
	onCancel,
	onResetDefault,
}: TuiInputModalProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const effectiveTitle =
		title ?? translate(i18n, "inputModal.title", "Edit Value");
	const effectivePlaceholder =
		placeholder ?? translate(i18n, "inputModal.placeholder", "Enter value…");
	const effectivePreviewLabel =
		previewLabel ?? translate(i18n, "inputModal.livePreview", "Live Preview:");
	const lines = multiline ? value.split("\n") : [value];

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
					{effectiveTitle}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{translate(i18n, "palette.dismissHint", "esc")}
				</text>
			</box>

			{/* Description */}
			{description && (
				<box marginBottom={1}>
					<text fg={c.fgSecondary} attributes={TextAttributes.DIM}>
						{description}
					</text>
				</box>
			)}

			{/* Optional Read-Only Instructions Banner */}
			{instructions && instructions.length > 0 && (
				<box
					flexDirection="column"
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					marginBottom={1}
				>
					{instructions.map((inst, idx) => {
						const icon =
							inst.variant === "warning"
								? "⚠️"
								: inst.variant === "tip"
									? "💡"
									: "ℹ️";
						return (
							<box key={idx} height={1} flexDirection="row">
								<text fg={c.accentSecondary} attributes={TextAttributes.BOLD}>
									{icon}{" "}
								</text>
								<text fg={c.fgSecondary}>{inst.text}</text>
							</box>
						);
					})}
				</box>
			)}

			{/* Optional Read-Only Reference Example Hints */}
			{examples && examples.length > 0 && (
				<box
					flexDirection="column"
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					marginBottom={1}
				>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{translate(
							i18n,
							"inputModal.references",
							"Syntax & Format References:",
						)}
					</text>
					{examples.map((ex, idx) => (
						<box key={idx} height={1} flexDirection="row">
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								• {ex.label}:{" "}
							</text>
							<text fg={c.fgPrimary}>{ex.sample} </text>
							{ex.description && (
								<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
									({ex.description})
								</text>
							)}
						</box>
					))}
				</box>
			)}

			{/* Input Buffer Area (Single Line or Multiline Buffer) */}
			{multiline ? (
				<box
					flexDirection="column"
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					paddingTop={0}
					paddingBottom={0}
					marginBottom={1}
				>
					{lines.map((lineText, idx) => {
						const isCurrent = idx === activeLineIndex;
						return (
							<box key={idx} height={1} flexDirection="row">
								<text fg={isCurrent ? c.accentPrimary : c.fgDim}>
									{String(idx + 1).padStart(2, "0")} │{" "}
								</text>
								<text
									fg={c.fgPrimary}
									attributes={isCurrent ? TextAttributes.BOLD : 0}
								>
									{lineText}
								</text>
								{isCurrent && <text fg={c.accentPrimary}>▎</text>}
							</box>
						);
					})}
				</box>
			) : (
				<box
					height={1}
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					marginBottom={1}
					flexDirection="row"
				>
					{value.length > 0 ? (
						<>
							<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
								{value}
							</text>
							<text fg={c.accentPrimary}>▎</text>
						</>
					) : (
						<>
							<text fg={c.accentPrimary}>▎</text>
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{effectivePlaceholder}
							</text>
						</>
					)}
				</box>
			)}

			{/* Live Dynamic Output Preview Box */}
			{previewValue && (
				<box
					flexDirection="column"
					backgroundColor={c.bgSurface}
					borderStyle="single"
					borderColor={c.borderSubtle}
					paddingLeft={1}
					paddingRight={1}
					marginBottom={1}
				>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{effectivePreviewLabel}
					</text>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{previewValue}
					</text>
				</box>
			)}

			{/* Action Footer */}
			<box flexDirection="row">
				<box
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					marginRight={2}
					onMouseDown={() => onConfirm?.()}
				>
					<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
						{translate(
							i18n,
							multiline ? "modal.confirmMultiline" : "modal.confirmEnter",
							multiline ? "Confirm (Ctrl+Enter)" : "Confirm (Enter)",
						)}
					</text>
				</box>

				<box
					backgroundColor={c.bgActive}
					paddingLeft={1}
					paddingRight={1}
					marginRight={2}
					onMouseDown={() => onCancel?.()}
				>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{translate(i18n, "modal.cancelEsc", "Cancel (Esc)")}
					</text>
				</box>

				{onResetDefault && (
					<box
						backgroundColor={c.bgActive}
						paddingLeft={1}
						paddingRight={1}
						onMouseDown={() => onResetDefault?.()}
					>
						<text fg={c.statusWarning} attributes={TextAttributes.DIM}>
							{translate(i18n, "modal.resetDefault", "Reset Default (Ctrl+R)")}
						</text>
					</box>
				)}
			</box>
		</box>
	);
}
