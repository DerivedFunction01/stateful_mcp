import type { TabRegistry } from "../contributions/tab-registry";
import type { ViewRegistry } from "../contributions/view-registry";

export type FocusedPane = "main" | "sidepanel" | "palette" | "modal";
export type SidepanelPosition = "left" | "right";

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
}

export class WindowLayoutStateManager {
	private activeTabId = "scratchpad";
	private sidepanelOpen = true;
	private sidepanelPosition: SidepanelPosition = "right";
	private sidepanelWidthRatio = 0.35;
	private activeContainerId = "slots";
	private focusedPane: FocusedPane = "main";
	private modalStack: ModalDescriptor[] = [];
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
		if (!this.sidepanelOpen && this.focusedPane === "sidepanel") {
			this.focusedPane = "main";
		}
		this.notify();
	}

	setSidepanelOpen(open: boolean): void {
		if (this.sidepanelOpen !== open) {
			this.sidepanelOpen = open;
			if (!open && this.focusedPane === "sidepanel") {
				this.focusedPane = "main";
			}
			this.notify();
		}
	}

	setSidepanelPosition(position: SidepanelPosition): void {
		if (this.sidepanelPosition !== position) {
			this.sidepanelPosition = position;
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
		if (this.activeContainerId !== containerId) {
			this.activeContainerId = containerId;
			if (!this.sidepanelOpen) {
				this.sidepanelOpen = true;
			}
			this.notify();
		}
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
