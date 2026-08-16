import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { TuiNamedColors } from "../tokens";
import { TuiModal } from "./TuiModal";

export interface TuiPaletteCommand {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	readonly shortcut?: string;
	readonly description?: string;
}

export interface TuiCommandPaletteProps {
	readonly query?: string;
	readonly items: readonly TuiPaletteCommand[];
	readonly selectedIndex?: number;
	readonly width?: number;
	readonly maxVisible?: number;
	readonly i18n?: I18nKernel;
	readonly placeholder?: string;
	readonly emptyMessage?: string;
}

export function TuiCommandPalette({
	query = "",
	items,
	selectedIndex = 0,
	width = 64,
	maxVisible = 10,
	i18n,
	placeholder,
	emptyMessage,
}: TuiCommandPaletteProps) {
	const title = translate(i18n, "palette.title", "Commands");
	const dismissHint = translate(i18n, "palette.dismissHint", "esc");
	const prompt = translate(i18n, "palette.searchPrompt", ">");
	const effectivePlaceholder = placeholder ?? translate(i18n, "palette.placeholder", "Search commands...");
	const effectiveEmptyMessage = emptyMessage ?? translate(i18n, "palette.noMatchingCommands", "No matching commands found.");

	// Group items by category if available
	const categories = Array.from(new Set(items.map((item) => item.category ?? translate(i18n, "palette.category.general", "Commands"))));

	// Flatten with category headers
	let flatIndex = 0;
	const renderedRows: Array<
		| { type: "header"; category: string }
		| { type: "item"; item: TuiPaletteCommand; isSelected: boolean }
	> = [];

	for (const cat of categories) {
		const catItems = items.filter((item) => (item.category ?? translate(i18n, "palette.category.general", "Commands")) === cat);
		if (categories.length > 1) {
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

	const visibleRows = renderedRows.slice(0, maxVisible + (categories.length > 1 ? categories.length : 0));

	return (
		<TuiModal title={title} dismissHint={dismissHint} width={width} borderColor="cyan">
			{/* Search Input */}
			<box height={1} marginBottom={1} flexDirection="row">
				<text fg={TuiNamedColors.amber} attributes={TextAttributes.BOLD}>
					{prompt}{" "}
				</text>
				{query.length > 0 ? (
					<text fg={TuiNamedColors.primary}>{query}</text>
				) : (
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						{effectivePlaceholder}
					</text>
				)}
			</box>

			{/* Divider */}
			<box height={1} marginBottom={1}>
				<text fg={TuiNamedColors.border}>{"─".repeat(Math.max(4, width - 4))}</text>
			</box>

			{/* Item List */}
			<box flexDirection="column">
				{visibleRows.length === 0 && (
					<box padding={1}>
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{effectiveEmptyMessage}
						</text>
					</box>
				)}
				{visibleRows.map((row, idx) => {
					if (row.type === "header") {
						return (
							<box key={`hdr-${row.category}-${idx}`} height={1} marginTop={idx > 0 ? 1 : 0}>
								<text fg={TuiNamedColors.purple} attributes={TextAttributes.BOLD}>
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
							flexDirection="row"
						>
							<text
								fg={isSelected ? "black" : TuiNamedColors.primary}
								attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
							>
								{isSelected ? " " : "  "}{item.title}
							</text>
							<box flexGrow={1} />
							{item.shortcut && (
								<text
									fg={isSelected ? "cyan" : TuiNamedColors.muted}
									attributes={isSelected ? TextAttributes.INVERSE : TextAttributes.DIM}
								>
									{item.shortcut}{" "}
								</text>
							)}
						</box>
					);
				})}
			</box>
		</TuiModal>
	);
}
