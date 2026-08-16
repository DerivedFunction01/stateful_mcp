import type {
	ExtensionViewProvider,
	ViewContainerContribution,
	ViewContribution,
} from "./types";

export interface RegisteredViewContainer extends ViewContainerContribution {
	readonly extensionId?: string;
}

export interface RegisteredView extends ViewContribution {
	readonly extensionId?: string;
	readonly provider?: ExtensionViewProvider;
}

export class ViewRegistry {
	private readonly containers = new Map<string, RegisteredViewContainer>();
	private readonly views = new Map<string, RegisteredView>();
	private readonly listeners = new Set<() => void>();

	constructor() {
		// Register built-in default containers
		this.registerContainer({
			id: "explorer",
			title: "Explorer",
			icon: "📁",
			altKey: "1",
			order: 10,
		});
		this.registerContainer({
			id: "slots",
			title: "Macro Slots",
			icon: "▧",
			altKey: "2",
			order: 20,
		});
		this.registerContainer({
			id: "journal",
			title: "Journal History",
			icon: "◷",
			altKey: "3",
			order: 30,
		});
	}

	registerContainer(
		container: ViewContainerContribution,
		extensionId?: string,
	): void {
		this.containers.set(container.id, {
			...container,
			extensionId,
		});
		this.notify();
	}

	unregisterContainer(containerId: string): boolean {
		const removed = this.containers.delete(containerId);
		if (removed) {
			// Remove any views belonging to this container
			for (const [viewId, view] of this.views.entries()) {
				if (view.containerId === containerId) {
					this.views.delete(viewId);
				}
			}
			this.notify();
		}
		return removed;
	}

	getContainers(): readonly RegisteredViewContainer[] {
		return Array.from(this.containers.values()).sort(
			(a, b) => (a.order ?? 100) - (b.order ?? 100),
		);
	}

	getContainer(containerId: string): RegisteredViewContainer | undefined {
		return this.containers.get(containerId);
	}

	getContainerForAltKey(altKey: string): RegisteredViewContainer | undefined {
		return this.getContainers().find((c) => c.altKey === altKey);
	}

	registerView(
		view: ViewContribution,
		provider?: ExtensionViewProvider,
		extensionId?: string,
	): void {
		this.views.set(view.id, {
			...view,
			provider,
			extensionId,
		});
		this.notify();
	}

	registerViewProvider(
		viewId: string,
		provider: ExtensionViewProvider,
	): boolean {
		const existing = this.views.get(viewId);
		if (existing) {
			this.views.set(viewId, { ...existing, provider });
			this.notify();
			return true;
		}
		return false;
	}

	unregisterView(viewId: string): boolean {
		const removed = this.views.delete(viewId);
		if (removed) {
			this.notify();
		}
		return removed;
	}

	getViewsForContainer(containerId: string): readonly RegisteredView[] {
		return Array.from(this.views.values())
			.filter((v) => v.containerId === containerId)
			.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
	}

	getView(viewId: string): RegisteredView | undefined {
		return this.views.get(viewId);
	}

	getAllViews(): readonly RegisteredView[] {
		return Array.from(this.views.values());
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
				console.error("Error in ViewRegistry listener:", e);
			}
		}
	}
}
