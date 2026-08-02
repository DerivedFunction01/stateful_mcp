import type { WindowDefinition } from "./cell-editor";
import { planWindow } from "./plan-window";
import type { WorkspaceWindowDeps } from "./workspace-window";
import { workspaceWindow } from "./workspace-window";

export type WindowFactory = (deps?: any) => WindowDefinition;

/**
 * Registry of window types the shared container can host. Adding a new window
 * (e.g. a plan window) means registering a new factory here — no container
 * change required.
 */
export class WindowRegistry {
	private readonly factories = new Map<string, WindowFactory>();

	register(type: string, factory: WindowFactory): void {
		this.factories.set(type, factory);
	}

	create(type: string, deps?: any): WindowDefinition | null {
		const factory = this.factories.get(type);
		return factory ? factory(deps) : null;
	}

	has(type: string): boolean {
		return this.factories.has(type);
	}

	list(): string[] {
		return [...this.factories.keys()];
	}
}

/**
 * Convenience constructor used by consumers that want the extensible window
 * set: notebook, workspace, and the future plan window.
 */
export function createWindowRegistry(): WindowRegistry {
	const registry = new WindowRegistry();
	registry.register("plan", () => planWindow());
	return registry;
}

/** Register the workspace window against an existing registry. */
export function registerWorkspaceWindow(
	registry: WindowRegistry,
	deps: WorkspaceWindowDeps,
): void {
	registry.register("workspace", () => workspaceWindow(deps));
}
