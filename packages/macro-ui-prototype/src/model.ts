export type DomainFixture = "core" | "retail" | "engineering" | "clinical";
export type PanelId = "explorer" | "slots" | "journal" | "domain";
export type ActivityViewId = "workspace" | "extensions" | "sessions" | "settings";
export type PanelRegion = "activity" | "inspector";
export type PanelDock = "start" | "end";

export interface PrototypePanelRegion {
	readonly open: boolean;
	readonly dock: PanelDock;
}

export interface PrototypeLine {
	readonly text: string;
	readonly preview?: string;
	readonly status: "valid" | "invalid" | "empty" | "pinned";
	readonly diagnostic?: string;
}

export interface PrototypeJournalEntry {
	readonly id: string;
	readonly time: string;
	readonly macro: string;
	readonly status: "committed" | "reversed";
	readonly fingerprint: string;
	readonly reason?: string;
}

export interface PrototypeCommand {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly shortcut?: string;
}

export interface PrototypeWorkspaceState {
	readonly fixture: DomainFixture;
	readonly activeTabId: string;
	readonly activeActivityViewId: ActivityViewId;
	readonly activeInspectorViewId: PanelId;
	readonly inspectorMode: "follow" | "pinned";
	readonly pinnedInspectorViewId?: PanelId;
	readonly panelRegions: Readonly<Record<PanelRegion, PrototypePanelRegion>>;
	readonly paletteOpen: boolean;
	readonly paletteQuery: string;
	readonly paletteSelection: number;
	readonly focusedInteractionId?: string;
	readonly dropdownOpen: boolean;
	readonly selectedDropdownValue: string;
	readonly diagramNode: string;
	readonly scratchpadLines: readonly PrototypeLine[];
	readonly journalEntries: readonly PrototypeJournalEntry[];
	readonly commands: readonly PrototypeCommand[];
}

export type PrototypeAction =
	| { readonly type: "fixture"; readonly fixture: DomainFixture }
	| { readonly type: "tab"; readonly id: string }
	| { readonly type: "view"; readonly id: PanelId }
	| { readonly type: "activity-view"; readonly id: ActivityViewId }
	| { readonly type: "inspector-pin" }
	| { readonly type: "toggle-panel" }
	| { readonly type: "toggle-region"; readonly region: PanelRegion }
	| { readonly type: "dock-region"; readonly region: PanelRegion; readonly dock: PanelDock }
	| { readonly type: "palette-open" }
	| { readonly type: "palette-close" }
	| { readonly type: "palette-query"; readonly query: string }
	| { readonly type: "palette-move"; readonly delta: number }
	| { readonly type: "dropdown-toggle" }
	| { readonly type: "dropdown-select"; readonly value: string }
	| { readonly type: "focus"; readonly id: string }
	| { readonly type: "diagram-node"; readonly node: string };
