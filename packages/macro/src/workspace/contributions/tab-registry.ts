import type { ExtensionTabProvider, WorkspaceTabContribution } from "./types";

export interface RegisteredWorkspaceTab extends WorkspaceTabContribution {
	readonly extensionId?: string;
	readonly provider?: ExtensionTabProvider;
}

export class TabRegistry {
	private readonly tabs = new Map<string, RegisteredWorkspaceTab>();
	private readonly listeners = new Set<() => void>();

	constructor() {
		// Register core built-in tabs
		this.registerTab({
			id: "scratchpad",
			label: "Scratchpad",
			order: 10,
			defaultVisible: true,
			icon: "✎",
		});
		this.registerTab({
			id: "notebook",
			label: "Notebook",
			order: 20,
			defaultVisible: true,
			icon: "📓",
		});
		this.registerTab({
			id: "settings",
			label: "Settings",
			order: 90,
			defaultVisible: true,
			icon: "⚙",
		});
		this.registerTab({
			id: "extensions",
			label: "Extensions",
			order: 95,
			defaultVisible: false,
			icon: "▣",
		});
	}

	registerTab(
		tab: WorkspaceTabContribution,
		provider?: ExtensionTabProvider,
		extensionId?: string,
	): void {
		this.tabs.set(tab.id, {
			...tab,
			provider,
			extensionId,
		});
		this.notify();
	}

	registerTabProvider(tabId: string, provider: ExtensionTabProvider): boolean {
		const existing = this.tabs.get(tabId);
		if (existing) {
			this.tabs.set(tabId, { ...existing, provider });
			this.notify();
			return true;
		}
		return false;
	}

	unregisterTab(tabId: string): boolean {
		const removed = this.tabs.delete(tabId);
		if (removed) {
			this.notify();
		}
		return removed;
	}

	getTabs(): readonly RegisteredWorkspaceTab[] {
		return Array.from(this.tabs.values()).sort(
			(a, b) => (a.order ?? 100) - (b.order ?? 100),
		);
	}

	getTab(tabId: string): RegisteredWorkspaceTab | undefined {
		return this.tabs.get(tabId);
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
				console.error("Error in TabRegistry listener:", e);
			}
		}
	}
}
