import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiCursor } from "./TuiCursor";

export type TuiCommandPaletteVariant =
	| "opencode"
	| "opencode-bordered"
	| "opencode-floating"
	| "vscode-quickpick";

export interface TuiPaletteCommand {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	readonly shortcut?: string;
	readonly description?: string;
}

export interface TuiCommandPaletteProps {
	readonly variant?: TuiCommandPaletteVariant;
	readonly query?: string;
	readonly items: readonly TuiPaletteCommand[];
	readonly selectedIndex?: number;
	readonly width?: number;
	readonly maxVisible?: number;
	readonly i18n?: I18nKernel;
	readonly placeholder?: string;
	readonly emptyMessage?: string;
	readonly blinkCursor?: boolean;
	readonly theme?: TuiThemeDefinition;
}

export function TuiCommandPalette({
	variant = "opencode-bordered",
	query = "",
	items,
	selectedIndex = 0,
	width = 68,
	maxVisible = 12,
	i18n,
	placeholder,
	emptyMessage,
	blinkCursor = true,
	theme,
}: TuiCommandPaletteProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const title = translate(i18n, "palette.title", "Commands");
	const dismissHint = translate(i18n, "palette.dismissHint", "esc");
	const effectivePlaceholder =
		placeholder ?? translate(i18n, "palette.placeholder", "Search");
	const effectiveEmptyMessage =
		emptyMessage ??
		translate(
			i18n,
			"palette.noMatchingCommands",
			"No matching commands found.",
		);

	// Group items by category
	const categories = Array.from(
		new Set(
			items.map(
				(item) =>
					item.category ??
					translate(i18n, "palette.category.general", "Commands"),
			),
		),
	);

	// Flatten rows with category headers
	let flatIndex = 0;
	const renderedRows: Array<
		| { type: "header"; category: string }
		| { type: "item"; item: TuiPaletteCommand; isSelected: boolean }
	> = [];

	for (const cat of categories) {
		const catItems = items.filter(
			(item) =>
				(item.category ??
					translate(i18n, "palette.category.general", "Commands")) === cat,
		);
		if (categories.length > 0) {
			renderedRows.push({ type: "header", category: cat });
		}
		for (const item of catItems) {
			renderedRows.push({
				type: "item",
				item,
				isSelected: flatIndex === selectedIndex,
			});
			flatIndex++;
		}
	}

	const visibleRows = renderedRows.slice(
		0,
		maxVisible + (categories.length > 1 ? categories.length : 0),
	);

	const isBordered =
		variant === "opencode" ||
		variant === "opencode-bordered" ||
		variant === "vscode-quickpick";
	const activeSelectionBg =
		variant === "vscode-quickpick" ? c.borderActive : c.bgSelect;
	const activeSelectionFg =
		variant === "vscode-quickpick" ? c.fgInverse : c.bgSelectText;

	return (
		<box
			width={width}
			backgroundColor={c.bgSurface}
			borderStyle={isBordered ? "single" : undefined}
			borderColor={isBordered ? c.borderDefault : undefined}
			flexDirection="column"
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{/* Header: Title + Dismiss Hint */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{title}
				</text>
				<box flexGrow={1} />
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{dismissHint}
				</text>
			</box>

			{/* Search Input Bar with Flashing Cursor */}
			<box height={1} marginBottom={1} flexDirection="row">
				{query.length > 0 ? (
					<box flexDirection="row">
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							{query}
						</text>
						<TuiCursor char=" " blink={blinkCursor} theme={theme} />
					</box>
				) : (
					<box flexDirection="row">
						<TuiCursor
							char={effectivePlaceholder.slice(0, 1)}
							blink={blinkCursor}
							isPlaceholder={true}
							theme={theme}
						/>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{effectivePlaceholder.slice(1)}
						</text>
					</box>
				)}
			</box>

			{/* VS Code divider if applicable */}
			{variant === "vscode-quickpick" && (
				<box height={1} marginBottom={1}>
					<text fg={c.borderDefault}>{"─".repeat(Math.max(4, width - 4))}</text>
				</box>
			)}

			{/* Item List */}
			<box flexDirection="column">
				{visibleRows.length === 0 && (
					<box padding={1}>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
							{effectiveEmptyMessage}
						</text>
					</box>
				)}

				{visibleRows.map((row, idx) => {
					if (row.type === "header") {
						return (
							<box
								key={`hdr-${row.category}-${idx}`}
								height={1}
								marginTop={idx > 0 ? 1 : 0}
								marginBottom={0}
							>
								<text fg={c.accentSecondary} attributes={TextAttributes.BOLD}>
									{row.category}
								</text>
							</box>
						);
					}

					const { item, isSelected } = row;
					return (
						<box
							key={item.id}
							height={1}
							backgroundColor={isSelected ? activeSelectionBg : undefined}
							paddingLeft={1}
							paddingRight={1}
							flexDirection="row"
						>
							<text
								fg={isSelected ? activeSelectionFg : c.fgPrimary}
								attributes={isSelected ? TextAttributes.BOLD : 0}
							>
								{item.title}
							</text>

							<box flexGrow={1} />

							{item.shortcut && (
								<text
									fg={isSelected ? activeSelectionFg : c.fgMuted}
									attributes={
										isSelected ? TextAttributes.BOLD : TextAttributes.DIM
									}
								>
									{item.shortcut}
								</text>
							)}
						</box>
					);
				})}
			</box>
		</box>
	);
}
