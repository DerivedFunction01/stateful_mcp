import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── TUI TOGGLE / SWITCH ──────────────────────────────────────────────────────

export type TuiToggleVariant = "switch" | "pill" | "square";

export interface TuiToggleProps {
	readonly label: string;
	readonly checked: boolean;
	readonly variant?: TuiToggleVariant;
	readonly description?: string;
	readonly isFocused?: boolean;
	readonly disabled?: boolean;
	readonly theme?: TuiThemeDefinition;
}

export function TuiToggle({
	label,
	checked,
	variant = "switch",
	description,
	isFocused = false,
	disabled = false,
	theme,
}: TuiToggleProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	// Visual switch glyphs
	let switchVisual: string;
	let switchFg = disabled ? c.fgDim : checked ? c.statusSuccess : c.fgDim;
	let switchBg: string | undefined;

	if (variant === "pill") {
		switchVisual = checked ? "( ──● )" : "( ●── )";
		switchFg = disabled ? c.fgDim : checked ? c.accentPrimary : c.fgMuted;
	} else if (variant === "square") {
		switchVisual = checked ? "[ ■ ]" : "[   ]";
		switchFg = disabled ? c.fgDim : checked ? c.accentPrimary : c.fgMuted;
	} else {
		// "switch"
		switchVisual = checked ? "[ON ●]" : "[● OFF]";
		if (checked && !disabled) {
			switchBg = isFocused ? c.statusSuccess : undefined;
			switchFg = isFocused ? c.fgInverse : c.statusSuccess;
		}
	}

	const focusPillar = isFocused ? "▎" : " ";
	const focusFg = isFocused ? c.accentPrimary : "transparent";

	return (
		<box flexDirection="column">
			<box
				flexDirection="row"
				height={1}
				backgroundColor={isFocused ? c.bgActive : undefined}
			>
				<text fg={focusFg} attributes={TextAttributes.BOLD}>
					{focusPillar}
				</text>
				<box
					backgroundColor={switchBg}
					paddingLeft={1}
					paddingRight={1}
					marginRight={1}
				>
					<text fg={switchFg} attributes={TextAttributes.BOLD}>
						{switchVisual}
					</text>
				</box>
				<text
					fg={disabled ? c.fgDim : isFocused ? c.fgPrimary : c.fgSecondary}
					attributes={isFocused ? TextAttributes.BOLD : 0}
				>
					{label}
				</text>
			</box>
			{description && (
				<box paddingLeft={2} height={1}>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{description}
					</text>
				</box>
			)}
		</box>
	);
}

// ─── TUI CHECKBOX & CHECKBOX GROUP ───────────────────────────────────────────

export interface TuiCheckboxProps {
	readonly label: string;
	readonly checked: boolean | "indeterminate";
	readonly isFocused?: boolean;
	readonly disabled?: boolean;
	readonly theme?: TuiThemeDefinition;
}

export function TuiCheckbox({
	label,
	checked,
	isFocused = false,
	disabled = false,
	theme,
}: TuiCheckboxProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const glyph = checked === "indeterminate" ? "[-]" : checked ? "[✓]" : "[ ]";
	const glyphFg = disabled
		? c.fgDim
		: checked
			? c.accentPrimary
			: isFocused
				? c.borderActive
				: c.fgMuted;

	return (
		<box
			flexDirection="row"
			height={1}
			backgroundColor={isFocused ? c.bgActive : undefined}
		>
			<text
				fg={isFocused ? c.accentPrimary : "transparent"}
				attributes={TextAttributes.BOLD}
			>
				{isFocused ? "▎" : " "}
			</text>
			<text fg={glyphFg} attributes={checked ? TextAttributes.BOLD : 0}>
				{" "}
				{glyph}{" "}
			</text>
			<text
				fg={disabled ? c.fgDim : isFocused ? c.fgPrimary : c.fgSecondary}
				attributes={isFocused ? TextAttributes.BOLD : 0}
			>
				{label}
			</text>
		</box>
	);
}

export interface TuiCheckboxItem {
	readonly id: string;
	readonly label: string;
	readonly checked: boolean | "indeterminate";
	readonly disabled?: boolean;
}

export interface TuiCheckboxGroupProps {
	readonly items: readonly TuiCheckboxItem[];
	readonly focusedIndex?: number;
	readonly label?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiCheckboxGroup({
	items,
	focusedIndex = 0,
	label,
	theme,
}: TuiCheckboxGroupProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	return (
		<box flexDirection="column">
			{label && (
				<box height={1} marginBottom={0}>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{label}
					</text>
				</box>
			)}
			{items.map((item, idx) => (
				<TuiCheckbox
					key={item.id}
					label={item.label}
					checked={item.checked}
					isFocused={idx === focusedIndex}
					disabled={item.disabled}
					theme={theme}
				/>
			))}
		</box>
	);
}

// ─── TUI RADIO GROUP ──────────────────────────────────────────────────────────

export interface TuiRadioOption {
	readonly id: string;
	readonly label: string;
	readonly meta?: string;
	readonly disabled?: boolean;
}

export interface TuiRadioGroupProps {
	readonly options: readonly TuiRadioOption[];
	readonly selectedId: string;
	readonly focusedIndex?: number;
	readonly label?: string;
	readonly theme?: TuiThemeDefinition;
}

export function TuiRadioGroup({
	options,
	selectedId,
	focusedIndex = 0,
	label,
	theme,
}: TuiRadioGroupProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	return (
		<box flexDirection="column">
			{label && (
				<box height={1} marginBottom={0}>
					<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
						{label}
					</text>
				</box>
			)}
			{options.map((opt, idx) => {
				const isSelected = opt.id === selectedId;
				const isFocused = idx === focusedIndex;
				const glyph = isSelected ? "(●)" : "( )";
				const glyphFg = opt.disabled
					? c.fgDim
					: isSelected
						? c.accentPrimary
						: isFocused
							? c.borderActive
							: c.fgMuted;

				return (
					<box
						key={opt.id}
						flexDirection="row"
						height={1}
						backgroundColor={isFocused ? c.bgActive : undefined}
					>
						<text
							fg={isFocused ? c.accentPrimary : "transparent"}
							attributes={TextAttributes.BOLD}
						>
							{isFocused ? "▎" : " "}
						</text>
						<text
							fg={glyphFg}
							attributes={isSelected ? TextAttributes.BOLD : 0}
						>
							{" "}
							{glyph}{" "}
						</text>
						<text
							fg={
								opt.disabled ? c.fgDim : isFocused ? c.fgPrimary : c.fgSecondary
							}
							attributes={isFocused ? TextAttributes.BOLD : 0}
						>
							{opt.label}
						</text>
						{opt.meta && (
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{" "}
								{opt.meta}
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}
