import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { TuiNamedColors } from "../tokens";

export interface TuiListItem {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	readonly description?: string;
	readonly shortcut?: string;
	readonly meta?: string;
	readonly icon?: string;
	readonly badge?: string;
	readonly badgeVariant?: "success" | "warning" | "error" | "info" | "muted";
}

export interface TuiListProps {
	readonly items: readonly TuiListItem[];
	readonly selectedIndex?: number;
	readonly maxVisible?: number;
	readonly emptyMessage?: string;
	readonly renderItem?: (item: TuiListItem, isSelected: boolean) => ReactNode;
}

export function TuiList({
	items,
	selectedIndex = -1,
	maxVisible,
	emptyMessage = "No items available.",
	renderItem,
}: TuiListProps) {
	if (items.length === 0) {
		return (
			<box padding={1}>
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					{emptyMessage}
				</text>
			</box>
		);
	}

	const visibleItems = maxVisible ? items.slice(0, maxVisible) : items;

	return (
		<box flexDirection="column">
			{visibleItems.map((item, index) => {
				const isSelected = index === selectedIndex;
				if (renderItem) {
					return renderItem(item, isSelected);
				}

				const iconStr = item.icon ? `${item.icon} ` : "";
				const catStr = item.category ? `[${item.category}] ` : "";
				const descStr = item.description ? ` - ${item.description}` : "";
				const mainContent = `${iconStr}${catStr}${item.title}${descStr}`;

				return (
					<box
						key={item.id}
						height={1}
						flexDirection="row"
						paddingLeft={1}
						paddingRight={1}
					>
						<text
							attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
							fg={isSelected ? "yellow" : TuiNamedColors.primary}
						>
							{isSelected ? "> " : "  "}{mainContent}
						</text>
						<box flexGrow={1} />
						{item.meta && (
							<text
								fg={TuiNamedColors.muted}
								attributes={isSelected ? TextAttributes.INVERSE : TextAttributes.DIM}
							>
								{item.meta}
							</text>
						)}
						{item.shortcut && (
							<text
								fg={isSelected ? "cyan" : TuiNamedColors.muted}
								attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : TextAttributes.DIM}
							>
								{"  "}{item.shortcut}
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}
