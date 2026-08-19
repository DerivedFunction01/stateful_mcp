import { type MouseEvent, TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiCursor } from "./TuiCursor";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TuiDropdownOption {
	readonly id: string;
	readonly label: string;
	/** Optional category for grouping */
	readonly category?: string;
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
	/** Whether the dropdown popover/modal is currently open */
	readonly isOpen?: boolean;
	/** Whether the control has keyboard focus */
	readonly isFocused?: boolean;
	/** Label rendered above the control */
	readonly label?: string;
	/** Title for modal header */
	readonly title?: string;
	/** Search query string */
	readonly query?: string;
	/** Placeholder shown when nothing is selected */
	readonly placeholder?: string;
	/** Maximum number of visible rows in the open popover/modal */
	readonly maxVisible?: number;
	/** Visual variant for the trigger control */
	readonly variant?: TuiDropdownVariant;
	/** Total width */
	readonly width?: number;
	/** Modal dialog width */
	readonly modalWidth?: number;
	/** Theme override */
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly onOpenChange?: (open: boolean) => void;
	readonly onHighlightChange?: (index: number) => void;
	readonly onSelect?: (id: string) => void;
	readonly onQueryChange?: (query: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TuiDropdown({
	options,
	selectedId,
	highlightedIndex = 0,
	isOpen = false,
	isFocused = false,
	label,
	title,
	query = "",
	placeholder,
	maxVisible = 8,
	variant = "bordered",
	width = 32,
	modalWidth = 56,
	theme,
	i18n,
	onOpenChange,
	onHighlightChange,
	onSelect,
}: TuiDropdownProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const effectivePlaceholder =
		placeholder ?? translate(i18n, "dropdown.placeholder");
	const modalTitle = title ?? label ?? translate(i18n, "dropdown.selectOption");
	const dismissHint = translate(i18n, "palette.dismissHint");

	const selectedOption = options.find((o) => o.id === selectedId);
	const borderColor = isFocused || isOpen ? c.borderActive : c.borderDefault;
	const triggerBg = isOpen ? c.bgElevated : c.bgSurface;

	// ── Trigger label text ────────────────────────────────────────────────────
	const triggerText = selectedOption
		? `${selectedOption.icon ? selectedOption.icon + " " : ""}${selectedOption.label}`
		: effectivePlaceholder;
	const triggerFg = selectedOption ? c.fgPrimary : c.fgDim;
	const innerWidth = Math.max(6, width - 6);
	const truncatedTrigger = triggerText
		.slice(0, innerWidth)
		.padEnd(innerWidth, " ");

	// Chevron state
	const chevron = isOpen ? "▲" : "▼";
	const chevronFg = isFocused || isOpen ? c.accentPrimary : c.fgMuted;

	// ── Filtered options matching search query ─────────────────────────────────
	const filteredOptions = query
		? options.filter(
				(o) =>
					o.label.toLowerCase().includes(query.toLowerCase()) ||
					(o.meta && o.meta.toLowerCase().includes(query.toLowerCase())),
			)
		: options;

	const categories = Array.from(
		new Set(filteredOptions.map((o) => o.category).filter(Boolean)),
	) as string[];

	const renderTrigger = () => (
		<box
			borderStyle={variant === "bordered" ? "single" : undefined}
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

	// ── Command-Palette Style Modal Dialog ────────────────────────────────────
	const renderModal = () => (
		<box
			width={modalWidth}
			backgroundColor={c.bgSurface}
			borderStyle="single"
			borderColor={c.borderDefault}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
			marginTop={1}
		>
			{/* Header: Title + Dismiss Hint */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{modalTitle}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{dismissHint}
				</text>
			</box>

			{/* Search Input Bar with Blinking Cursor */}
			<box height={1} marginBottom={1} flexDirection="row">
				{query.length > 0 ? (
					<box flexDirection="row">
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{query}
						</text>
						<TuiCursor char=" " theme={theme} />
					</box>
				) : (
					<box flexDirection="row">
						<TuiCursor
							char={effectivePlaceholder.slice(0, 1)}
							isPlaceholder={true}
							theme={theme}
						/>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{effectivePlaceholder.slice(1)}
						</text>
					</box>
				)}
			</box>

			{/* Options List */}
			<box flexDirection="column">
				{filteredOptions.length === 0 && (
					<box padding={1}>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{translate(i18n, "dropdown.noOptions")}
						</text>
					</box>
				)}

				{filteredOptions.slice(0, maxVisible).map((opt, idx) => {
					const isHighlighted = idx === highlightedIndex;
					const isSelected = opt.id === selectedId;

					if (opt.divider) {
						return (
							<box key={opt.id} height={1}>
								<text fg={c.borderSubtle}>
									{"─".repeat(Math.max(4, modalWidth - 6))}
								</text>
							</box>
						);
					}

					const optionBg = isHighlighted ? c.bgSelect : undefined;
					const checkmark = isSelected ? "●" : "○";
					const checkFg = isSelected ? c.accentPrimary : c.fgDim;
					const optFg = isHighlighted
						? c.bgSelectText
						: opt.disabled
							? c.fgDim
							: c.fgPrimary;

					return (
						<box
							key={opt.id}
							height={1}
							backgroundColor={optionBg}
							paddingLeft={1}
							paddingRight={1}
							flexDirection="row"
							onMouseDown={(event: MouseEvent) => {
								if (event.button !== 0 || opt.disabled || opt.divider) return;
								onHighlightChange?.(idx);
								onSelect?.(opt.id);
								onOpenChange?.(false);
							}}
						>
							<text fg={checkFg} attributes={TextAttributes.BOLD}>
								{checkmark}{" "}
							</text>
							{opt.icon && <text fg={optFg}>{opt.icon} </text>}
							<text
								fg={optFg}
								attributes={
									isHighlighted || isSelected
										? TextAttributes.BOLD
										: opt.disabled
											? TextAttributes.DIM
											: 0
								}
							>
								{opt.label}
							</text>

							<box flexGrow={1} />

							{opt.meta && (
								<text
									fg={isHighlighted ? c.bgSelectText : c.fgMuted}
									attributes={TextAttributes.DIM}
								>
									{opt.meta}
								</text>
							)}
						</box>
					);
				})}
			</box>
		</box>
	);

	return (
		<box flexDirection="column" width={isOpen ? modalWidth : width}>
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
			{isOpen && renderModal()}
		</box>
	);
}
