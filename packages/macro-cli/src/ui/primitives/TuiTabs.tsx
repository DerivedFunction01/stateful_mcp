import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../tokens";

export interface TuiTabItem {
	readonly id: string;
	readonly label: string;
	readonly icon?: string;
	readonly isDirty?: boolean;
	readonly badge?: string | number;
}

export interface TuiTabsProps {
	readonly tabs: readonly TuiTabItem[];
	readonly activeTabId?: string;
	readonly onSelectTab?: (id: string) => void;
	readonly maxWidth?: number;
	readonly style?: "standard" | "compact" | "brackets";
}

export function TuiTabs({
	tabs,
	activeTabId,
	style = "standard",
}: TuiTabsProps) {
	return (
		<box height={1} paddingLeft={1} paddingRight={1} overflow="hidden" flexDirection="row">
			{tabs.map((tab, index) => {
				const isActive = tab.id === activeTabId;
				const iconStr = tab.icon ? `${tab.icon} ` : "";
				const dirtyStr = tab.isDirty ? "*" : "";
				const badgeStr = tab.badge !== undefined ? ` (${tab.badge})` : "";
				const content = `${iconStr}${tab.label}${dirtyStr}${badgeStr}`;

				if (style === "brackets") {
					return (
						<text
							key={tab.id}
							attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : TextAttributes.DIM}
							fg={isActive ? TuiNamedColors.accent : TuiNamedColors.primary}
						>
							{index ? " " : ""}[{content}]
						</text>
					);
				}

				return (
					<text
						key={tab.id}
						attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
						fg={isActive ? "white" : TuiNamedColors.muted}
					>
						{index ? "  " : ""} {content} 
					</text>
				);
			})}
		</box>
	);
}
