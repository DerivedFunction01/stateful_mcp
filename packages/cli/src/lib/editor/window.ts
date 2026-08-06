import type { ReactElement } from "react";

export type WindowSlot =
	| "navigation"
	| "primary"
	| "command"
	| "status"
	| "footer"
	| "sidebar"
	| "overlay";

export interface WindowRegion {
	slot: WindowSlot;
	/** Stable key for React reconciliation. */
	key: string;
	render(): ReactElement | null;
}

export interface WindowDefinition {
	type: string;
	regions: () => WindowRegion[];
}
