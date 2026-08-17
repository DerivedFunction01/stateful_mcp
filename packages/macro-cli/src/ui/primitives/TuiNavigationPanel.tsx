import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";
import { TuiList, type TuiListItem } from "./TuiList";
import { TuiSidepanel } from "./TuiSidepanel";

export type TuiNavigationRegion = "navigation" | "content" | "footer";

export interface TuiNavigationPanelProps {
	readonly title: string;
	readonly items: readonly TuiListItem[];
	readonly selectedIndex?: number;
	readonly focusedRegion?: TuiNavigationRegion;
	readonly width?: number;
	readonly content?: ReactNode;
	readonly footer?: ReactNode;
	readonly description?: string;
	readonly closeHint?: string;
	readonly isFocused?: boolean;
	readonly theme?: TuiThemeDefinition;
	readonly onHighlightChange?: (index: number) => void;
	readonly onSelect?: (id: string, index: number) => void;
}

export function TuiNavigationPanel({
	title,
	items,
	selectedIndex = 0,
	focusedRegion = "navigation",
	width = 64,
	content,
	footer,
	description,
	closeHint,
	isFocused = false,
	theme,
	onHighlightChange,
	onSelect,
}: TuiNavigationPanelProps) {
	const activeTheme = theme ?? GlobalThemeRegistry.getActive();
	const c = activeTheme.colors;
	const navigationWidth = Math.max(20, Math.min(30, Math.floor(width * 0.36)));
	return (
		<TuiSidepanel
			title={title}
			width={width}
			closeHint={closeHint}
			description={description}
			isFocused={isFocused}
			theme={activeTheme}
		>
			<box flexDirection="row" flexGrow={1}>
				<box
					width={navigationWidth}
					paddingRight={1}
					borderStyle="single"
					borderColor={
						focusedRegion === "navigation" ? c.borderActive : c.borderSubtle
					}
				>
					<TuiList
						items={items}
						selectedIndex={selectedIndex}
						theme={activeTheme}
						onHighlightChange={onHighlightChange}
						onSelect={onSelect}
					/>
				</box>
				<box flexDirection="column" flexGrow={1} paddingLeft={1}>
					<box flexGrow={1}>{content}</box>
					{footer && (
						<box paddingTop={1}>
							<text
								fg={
									focusedRegion === "footer" ? c.borderActive : c.borderSubtle
								}
							>
								{"─".repeat(Math.max(4, width - navigationWidth - 8))}
							</text>
							{footer}
						</box>
					)}
				</box>
			</box>
		</TuiSidepanel>
	);
}
