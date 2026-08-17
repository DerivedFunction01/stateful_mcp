import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

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
	readonly theme?: TuiThemeDefinition;
}

export function TuiList({
	items,
	selectedIndex = -1,
	maxVisible,
	emptyMessage = "No items available.",
	renderItem,
	theme,
}: TuiListProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	if (items.length === 0) {
		return (
			<box padding={1}>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
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

				const rowBg = isSelected ? c.bgActive : undefined;
				const pillarColor = isSelected ? c.accentPrimary : "transparent";
				const textColor = isSelected ? c.fgPrimary : c.fgMuted;

				return (
					<box
						key={item.id}
						height={1}
						flexDirection="row"
						backgroundColor={rowBg}
						paddingLeft={0}
						paddingRight={1}
					>
						{/* Left accent indicator */}
						<text fg={pillarColor} attributes={TextAttributes.BOLD}>
							{isSelected ? "▎" : " "}
						</text>
						<text
							fg={textColor}
							attributes={isSelected ? TextAttributes.BOLD : 0}
						>
							{" "}{mainContent}
						</text>
						<box flexGrow={1} />
						{item.meta && (
							<text
								fg={c.fgDim}
								attributes={TextAttributes.DIM}
							>
								{item.meta}
							</text>
						)}
						{item.shortcut && (
							<text
								fg={isSelected ? c.accentPrimary : c.fgDim}
								attributes={isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
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
