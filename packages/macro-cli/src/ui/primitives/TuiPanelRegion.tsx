import type { ReactNode } from "react";
import { TuiActivityRail, type TuiActivityItem } from "./TuiActivityRail";
import { TuiSidepanel, type TuiSidepanelCard } from "./TuiSidepanel";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiPanelDock = "start" | "end";

export interface TuiPanelRegionProps {
	readonly dock?: TuiPanelDock;
	readonly railItems: readonly TuiActivityItem[];
	readonly activeRailId?: string;
	readonly onSelectRail?: (id: string) => void;
	readonly title: string;
	readonly closeHint?: string;
	readonly panelWidth?: number;
	readonly cards?: readonly TuiSidepanelCard[];
	readonly description?: string;
	readonly children?: ReactNode;
	readonly isOpen?: boolean;
	readonly theme?: TuiThemeDefinition;
}

/**
 * Unified, dockable Panel Region component.
 * Combines TuiActivityRail and TuiSidepanel into a single composable unit:
 * - When dock="start" (default left): [ TuiActivityRail ][ Divider │ ][ TuiSidepanel ]
 * - When dock="end" (default right): [ TuiSidepanel ][ Divider │ ][ TuiActivityRail ]
 *
 * Supports seamless flipping, docking, and swapping with zero redundant code.
 */
export function TuiPanelRegion({
	dock = "start",
	railItems,
	activeRailId,
	onSelectRail,
	title,
	closeHint = "×",
	panelWidth = 30,
	cards,
	description,
	children,
	isOpen = true,
	theme,
}: TuiPanelRegionProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	const rail = (
		<TuiActivityRail
			items={railItems}
			activeId={activeRailId}
			onSelect={onSelectRail}
			theme={theme}
		/>
	);

	const divider = (
		<box width={1} flexDirection="column" alignItems="center">
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
			<text fg={c.borderDefault}>│</text>
		</box>
	);

	const panel = isOpen ? (
		<TuiSidepanel
			title={title}
			closeHint={closeHint}
			width={panelWidth}
			cards={cards}
			description={description}
			theme={theme}
		>
			{children}
		</TuiSidepanel>
	) : null;

	if (dock === "end") {
		return (
			<box flexDirection="row">
				{panel}
				{isOpen && divider}
				{rail}
			</box>
		);
	}

	// dock === "start" (Left side default)
	return (
		<box flexDirection="row">
			{rail}
			{isOpen && divider}
			{panel}
		</box>
	);
}
