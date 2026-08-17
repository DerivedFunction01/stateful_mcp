import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TuiDropdownOption {
	readonly id: string;
	readonly label: string;
	/** Optional icon/emoji rendered to the left of the label */
	readonly icon?: string;
	/** Optional right-side meta/description */
	readonly meta?: string;
	/** Renders as a visual separator before this option */
	readonly divider?: boolean;
	/** Grayed out, not selectable */
	readonly disabled?: boolean;
}

export type TuiDropdownVariant = "bordered" | "underline" | "filled";

export interface TuiDropdownProps {
	/** All available options */
	readonly options: readonly TuiDropdownOption[];
	/** Currently selected option id */
	readonly selectedId?: string;
	/** Index of the keyboard-highlighted option (while open) */
	readonly highlightedIndex?: number;
	/** Whether the dropdown popover is currently open */
	readonly isOpen?: boolean;
	/** Whether the control has keyboard focus */
	readonly isFocused?: boolean;
	/** Label rendered above the control */
	readonly label?: string;
	/** Placeholder shown when nothing is selected */
	readonly placeholder?: string;
	/** Maximum number of visible rows in the open popover */
	readonly maxVisible?: number;
	/** Visual variant for the trigger control */
	readonly variant?: TuiDropdownVariant;
	/** Total width */
	readonly width?: number;
	/** Theme override */
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onOpenChange?: (open: boolean) => void;
	readonly onHighlightChange?: (index: number) => void;
	readonly onSelect?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TuiDropdown({
	options,
	selectedId,
	highlightedIndex = 0,
	isOpen = false,
	isFocused = false,
	label,
	placeholder,
	maxVisible = 6,
	variant = "bordered",
	width = 32,
	theme,
	i18n,
	onOpenChange,
	onHighlightChange,
	onSelect,
}: TuiDropdownProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const effectivePlaceholder =
		placeholder ?? translate(i18n, "dropdown.placeholder", "Select an option");

	const selectedOption = options.find((o) => o.id === selectedId);
	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;

	// ── Trigger label text ────────────────────────────────────────────────────
	const triggerText = selectedOption
		? `${selectedOption.icon ? selectedOption.icon + " " : ""}${selectedOption.label}`
		: effectivePlaceholder;
	const triggerFg = selectedOption ? c.fgPrimary : c.fgDim;
	const innerWidth = Math.max(6, width - 6); // account for border + padding + chevron
	const truncatedTrigger = triggerText
		.slice(0, innerWidth)
		.padEnd(innerWidth, " ");

	// Chevron state
	const chevron = isOpen ? "▲" : "▼";
	const chevronFg = isFocused || isOpen ? c.accentPrimary : c.fgMuted;

	// ── UNDERLINE trigger variant ─────────────────────────────────────────────
	const renderTriggerUnderline = () => (
		<box flexDirection="column">
			<box
				flexDirection="row"
				backgroundColor={triggerBg}
				height={1}
				paddingLeft={1}
				paddingRight={1}
			>
				<text
					fg={triggerFg}
					attributes={selectedOption ? TextAttributes.BOLD : TextAttributes.DIM}
				>
					{truncatedTrigger}
				</text>
				<text fg={chevronFg}> {chevron}</text>
			</box>
			<box height={1}>
				<text fg={borderColor}>{"▔".repeat(width)}</text>
			</box>
		</box>
	);

	// ── FILLED trigger variant ────────────────────────────────────────────────
	const renderTriggerFilled = () => (
		<box
			flexDirection="row"
			backgroundColor={isOpen ? c.bgActive : c.bgSurface}
			height={1}
			paddingLeft={1}
			paddingRight={1}
		>
			<text
				fg={triggerFg}
				attributes={selectedOption ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{truncatedTrigger}
			</text>
			<text fg={chevronFg}> {chevron}</text>
		</box>
	);

	// ── BORDERED trigger variant (Default) ────────────────────────────────────
	const renderTriggerBordered = () => (
		<box
			borderStyle="single"
			borderColor={borderColor}
			backgroundColor={triggerBg}
			flexDirection="row"
			paddingLeft={1}
			paddingRight={1}
		>
			<text
				fg={triggerFg}
				attributes={selectedOption ? TextAttributes.BOLD : TextAttributes.DIM}
			>
				{truncatedTrigger}
			</text>
			<text fg={chevronFg}> {chevron}</text>
		</box>
	);

	const renderTrigger = () => {
		if (variant === "underline") return renderTriggerUnderline();
		if (variant === "filled") return renderTriggerFilled();
		return renderTriggerBordered();
	};

	// ── Popover option list ────────────────────────────────────────────────────
	const visibleOptions = options.slice(0, maxVisible);

	const renderPopover = () => (
		<box
			flexDirection="column"
			borderStyle="single"
			borderColor={c.borderActive}
			backgroundColor={c.bgElevated}
			width={width}
		>
			{visibleOptions.map((opt, idx) => {
				const isHighlighted = idx === highlightedIndex;
				const isSelected = opt.id === selectedId;

				if (opt.divider) {
					return (
						<box key={opt.id} height={1}>
							<text fg={c.borderSubtle}>
								{"─".repeat(Math.max(4, width - 2))}
							</text>
						</box>
					);
				}

				const optionBg = isHighlighted ? c.bgActive : undefined;
				const pillar = isHighlighted ? "▎" : " ";
				const pillarFg = isHighlighted ? c.accentPrimary : "transparent";
				const optFg = opt.disabled
					? c.fgDim
					: isHighlighted
						? c.fgPrimary
						: isSelected
							? c.accentPrimary
							: c.fgSecondary;
				const checkmark = isSelected ? "●" : " ";
				const checkFg = isSelected ? c.accentPrimary : "transparent";
				const metaFg = c.fgDim;
				const labelWidth = Math.max(4, width - 8);
				const labelText = `${opt.icon ? opt.icon + " " : ""}${opt.label}`
					.slice(0, labelWidth)
					.padEnd(labelWidth);

				return (
					<box
						key={opt.id}
						flexDirection="row"
						height={1}
						backgroundColor={optionBg}
						paddingLeft={0}
						paddingRight={1}
						onMouseDown={(event: MouseEvent) => {
							if (event.button !== 0 || opt.disabled || opt.divider) return;
							onHighlightChange?.(idx);
							onSelect?.(opt.id);
						}}
					>
						<text fg={pillarFg} attributes={TextAttributes.BOLD}>
							{pillar}
						</text>
						<text fg={checkFg}>{checkmark} </text>
						<text
							fg={optFg}
							attributes={
								isHighlighted
									? TextAttributes.BOLD
									: opt.disabled
										? TextAttributes.DIM
										: 0
							}
						>
							{labelText}
						</text>
						{opt.meta && (
							<text fg={metaFg} attributes={TextAttributes.DIM}>
								{opt.meta.slice(0, 6)}
							</text>
						)}
					</box>
				);
			})}
			{options.length > maxVisible && (
				<box height={1} paddingLeft={2}>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						+{options.length - maxVisible} more… ↑↓ to scroll
					</text>
				</box>
			)}
		</box>
	);

	return (
		<box flexDirection="column" width={width}>
			{label && (
				<box height={1}>
					<text
						fg={isFocused ? c.accentPrimary : c.fgSecondary}
						attributes={TextAttributes.BOLD}
					>
						{label}
					</text>
				</box>
			)}
			<box
				onMouseDown={(event: MouseEvent) => {
					if (event.button === 0) onOpenChange?.(!isOpen);
				}}
			>
				{renderTrigger()}
			</box>
			{isOpen && renderPopover()}
		</box>
	);
}
