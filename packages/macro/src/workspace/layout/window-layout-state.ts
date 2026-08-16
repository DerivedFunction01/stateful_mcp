import type { TabRegistry } from "../contributions/tab-registry";
import type { ViewRegistry } from "../contributions/view-registry";
import type { WorkspaceDock, WorkspaceRegionId } from "../contributions/types";

export type FocusedPane = "main" | "activity" | "sidepanel" | "palette" | "modal";
export type SidepanelPosition = "left" | "right";
export type InspectorMode = "follow" | "pinned";

export interface WorkspaceRegionState {
	readonly open: boolean;
	readonly dock: WorkspaceDock;
	readonly widthRatio: number;
}

export interface ModalDescriptor {
	readonly id: string;
	readonly title: string;
	readonly data?: unknown;
}

export interface WindowLayoutStateSnapshot {
	readonly activeTabId: string;
	readonly sidepanelOpen: boolean;
	readonly sidepanelPosition: SidepanelPosition;
	readonly sidepanelWidthRatio: number;
	readonly activeContainerId: string;
	readonly focusedPane: FocusedPane;
	readonly activeModal: ModalDescriptor | null;
	readonly regions: Readonly<Record<WorkspaceRegionId, WorkspaceRegionState>>;
	readonly activeActivityContainerId: string;
	readonly activeInspectorContainerId: string;
	readonly inspectorMode: InspectorMode;
	readonly pinnedInspectorViewId: string | null;
}

export class WindowLayoutStateManager {
	private activeTabId = "scratchpad";
	private sidepanelOpen = true;
	private sidepanelPosition: SidepanelPosition = "right";
	private sidepanelWidthRatio = 0.35;
	private activeContainerId = "slots";
	private focusedPane: FocusedPane = "main";
	private modalStack: ModalDescriptor[] = [];
	private regions: Record<WorkspaceRegionId, WorkspaceRegionState> = {
		activity: { open: true, dock: "start", widthRatio: 0.2 },
		inspector: { open: true, dock: "end", widthRatio: 0.35 },
	};
	private activeActivityContainerId = "explorer";
	private activeInspectorContainerId = "slots";
	private inspectorMode: InspectorMode = "follow";
	private pinnedInspectorViewId: string | null = null;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly tabRegistry?: TabRegistry,
		private readonly viewRegistry?: ViewRegistry,
		initialState?: Partial<WindowLayoutStateSnapshot>,
	) {
		if (initialState?.activeTabId) this.activeTabId = initialState.activeTabId;
		if (initialState?.sidepanelOpen !== undefined)
			this.sidepanelOpen = initialState.sidepanelOpen;
		if (initialState?.sidepanelPosition)
			this.sidepanelPosition = initialState.sidepanelPosition;
		if (initialState?.sidepanelWidthRatio !== undefined)
			this.sidepanelWidthRatio = initialState.sidepanelWidthRatio;
		if (initialState?.activeContainerId)
			this.activeContainerId = initialState.activeContainerId;
		if (initialState?.focusedPane) this.focusedPane = initialState.focusedPane;
		if (initialState?.regions) {
			this.regions = {
				activity: { ...this.regions.activity, ...initialState.regions.activity },
				inspector: { ...this.regions.inspector, ...initialState.regions.inspector },
			};
			this.sidepanelOpen = this.regions.inspector.open;
			this.sidepanelPosition = this.regions.inspector.dock === "start" ? "left" : "right";
		}
		if (initialState?.sidepanelOpen !== undefined && !initialState.regions) {
			this.regions.inspector = { ...this.regions.inspector, open: initialState.sidepanelOpen };
		}
		if (initialState?.activeActivityContainerId) this.activeActivityContainerId = initialState.activeActivityContainerId;
		if (initialState?.activeInspectorContainerId) this.activeInspectorContainerId = initialState.activeInspectorContainerId;
		if (initialState?.inspectorMode) this.inspectorMode = initialState.inspectorMode;
		if (initialState?.pinnedInspectorViewId !== undefined) this.pinnedInspectorViewId = initialState.pinnedInspectorViewId;
	}

	getSnapshot(): WindowLayoutStateSnapshot {
		return {
			activeTabId: this.activeTabId,
			sidepanelOpen: this.sidepanelOpen,
			sidepanelPosition: this.sidepanelPosition,
			sidepanelWidthRatio: this.sidepanelWidthRatio,
			activeContainerId: this.activeContainerId,
			focusedPane: this.focusedPane,
			activeModal: this.modalStack[this.modalStack.length - 1] ?? null,
			regions: { activity: { ...this.regions.activity }, inspector: { ...this.regions.inspector } },
			activeActivityContainerId: this.activeActivityContainerId,
			activeInspectorContainerId: this.activeInspectorContainerId,
			inspectorMode: this.inspectorMode,
			pinnedInspectorViewId: this.pinnedInspectorViewId,
		};
	}

	setActiveTab(tabId: string): void {
		if (this.activeTabId !== tabId) {
			this.activeTabId = tabId;
			this.notify();
		}
	}

	nextTab(direction: 1 | -1 = 1): void {
		if (!this.tabRegistry) return;
		const tabs = this.tabRegistry.getTabs();
		if (tabs.length === 0) return;
		const currentIndex = tabs.findIndex((t) => t.id === this.activeTabId);
		const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
		const nextTab = tabs[nextIndex];
		if (nextTab) {
			this.setActiveTab(nextTab.id);
		}
	}

	toggleSidepanel(): void {
		this.sidepanelOpen = !this.sidepanelOpen;
		this.regions.inspector = { ...this.regions.inspector, open: this.sidepanelOpen };
		if (!this.sidepanelOpen && this.focusedPane === "sidepanel") {
			this.focusedPane = "main";
		}
		this.notify();
	}

	setSidepanelOpen(open: boolean): void {
		if (this.sidepanelOpen !== open) {
			this.sidepanelOpen = open;
			this.regions.inspector = { ...this.regions.inspector, open };
			if (!open && this.focusedPane === "sidepanel") {
				this.focusedPane = "main";
			}
			this.notify();
		}
	}

	setSidepanelPosition(position: SidepanelPosition): void {
		if (this.sidepanelPosition !== position) {
			this.sidepanelPosition = position;
			this.regions.inspector = { ...this.regions.inspector, dock: position === "left" ? "start" : "end" };
			this.notify();
		}
	}

	setSidepanelWidthRatio(ratio: number): void {
		const clamped = Math.max(0.15, Math.min(0.65, ratio));
		if (this.sidepanelWidthRatio !== clamped) {
			this.sidepanelWidthRatio = clamped;
			this.notify();
		}
	}

	setActiveContainer(containerId: string): void {
		this.setActiveInspectorContainer(containerId);
	}

	setActiveActivityContainer(containerId: string): void {
		if (this.activeActivityContainerId !== containerId) {
			this.activeActivityContainerId = containerId;
			this.activeContainerId = containerId;
			this.openRegion("activity");
			this.notify();
		}
	}

	setActiveInspectorContainer(containerId: string): void {
		if (this.activeInspectorContainerId !== containerId || !this.regions.inspector.open) {
			this.activeContainerId = containerId;
			this.activeInspectorContainerId = containerId;
			this.openRegion("inspector");
			this.notify();
		}
	}

	toggleRegion(region: WorkspaceRegionId): void {
		this.setRegionOpen(region, !this.regions[region].open);
	}

	setRegionOpen(region: WorkspaceRegionId, open: boolean): void {
		if (this.regions[region].open === open) return;
		this.regions[region] = { ...this.regions[region], open };
		if (region === "inspector") this.sidepanelOpen = open;
		if (!open && ((region === "inspector" && this.focusedPane === "sidepanel") || (region === "activity" && this.focusedPane === "activity"))) this.focusedPane = "main";
		this.notify();
	}

	setRegionDock(region: WorkspaceRegionId, dock: WorkspaceDock): void {
		if (this.regions[region].dock !== dock) {
			this.regions[region] = { ...this.regions[region], dock };
			if (region === "inspector") this.sidepanelPosition = dock === "start" ? "left" : "right";
			this.notify();
		}
	}

	setRegionWidthRatio(region: WorkspaceRegionId, ratio: number): void {
		const clamped = Math.max(0.15, Math.min(0.65, ratio));
		if (this.regions[region].widthRatio !== clamped) {
			this.regions[region] = { ...this.regions[region], widthRatio: clamped };
			this.notify();
		}
	}

	setInspectorMode(mode: InspectorMode): void {
		if (this.inspectorMode !== mode) {
			this.inspectorMode = mode;
			if (mode === "follow") this.pinnedInspectorViewId = null;
			this.notify();
		}
	}

	setPinnedInspectorView(viewId: string | null): void {
		this.pinnedInspectorViewId = viewId;
		this.inspectorMode = viewId ? "pinned" : "follow";
		this.notify();
	}

	nextContainer(direction: 1 | -1 = 1): void {
		if (!this.viewRegistry) return;
		const containers = this.viewRegistry.getContainers();
		if (containers.length === 0) return;
		const currentIndex = containers.findIndex(
			(c) => c.id === this.activeContainerId,
		);
		const nextIndex =
			(currentIndex + direction + containers.length) % containers.length;
		const nextContainer = containers[nextIndex];
		if (nextContainer) {
			this.setActiveContainer(nextContainer.id);
		}
	}

	private openRegion(region: WorkspaceRegionId): void {
		if (!this.regions[region].open) this.regions[region] = { ...this.regions[region], open: true };
	}

	setFocusedPane(pane: FocusedPane): void {
		if (this.focusedPane !== pane) {
			this.focusedPane = pane;
			this.notify();
		}
	}

	openModal(modal: ModalDescriptor): void {
		this.modalStack.push(modal);
		this.focusedPane = "modal";
		this.notify();
	}

	closeModal(): ModalDescriptor | undefined {
		const closed = this.modalStack.pop();
		if (this.modalStack.length === 0) {
			this.focusedPane = "main";
		}
		this.notify();
		return closed;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in WindowLayoutStateManager listener:", e);
			}
		}
	}
}
