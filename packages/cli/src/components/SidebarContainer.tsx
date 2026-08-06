import { Box } from "ink";
import type { ReactNode } from "react";
import type { SidebarViewTab } from "../lib/editor/kernel";
import { SidebarActivityBar } from "./SidebarActivityBar";

export interface SidebarContainerProps {
	activeTab: SidebarViewTab;
	onSelectTab?: (tab: SidebarViewTab) => void;
	/** The active inspector panel rendered on the LEFT of the activity bar. */
	children: ReactNode;
}

/**
 * Wraps an inspector view and docks the vertical `SidebarActivityBar` on the
 * RIGHT border of the sidebar panel. The inspector content receives remaining
 * width via flexGrow and is height-constrained to the details pane.
 */
export function SidebarContainer({
	activeTab,
	onSelectTab,
	children,
}: SidebarContainerProps) {
	return (
		<Box flexDirection="row" width="100%" height="100%">
			<Box flexGrow={1} height="100%" overflow="hidden">
				{children}
			</Box>
			<SidebarActivityBar
				activeTab={activeTab}
				onSelectTab={onSelectTab ?? (() => {})}
			/>
		</Box>
	);
}
