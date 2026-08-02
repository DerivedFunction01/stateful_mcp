import type { WindowDefinition } from "./cell-editor";
import type { NotebookWindowDeps } from "./notebook-window";
import { notebookWindow } from "./notebook-window";
import { planWindow } from "./plan-window";
import type { WorkspaceWindowDeps } from "./workspace-window";
import { workspaceWindow } from "./workspace-window";

export type WorkspaceWindowFactory = (
	deps: WorkspaceWindowDeps,
) => WindowDefinition;
export type NotebookWindowFactory = (
	deps: NotebookWindowDeps,
) => WindowDefinition;

/**
 * Typed registry of window types the shared container can host. Adding a new
 * window (e.g. a plan window) means registering a new factory here — no
 * container change required.
 */
export class WindowRegistry {
	private readonly factories = new Map<
		string,
		(deps?: unknown) => WindowDefinition
	>();

	register(type: string, factory: (deps?: unknown) => WindowDefinition): void {
		this.factories.set(type, factory as (deps?: unknown) => WindowDefinition);
	}

	create(type: string, deps?: unknown): WindowDefinition | null {
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
 * set: notebook, workspace, and the future plan window. Each window factory is
 * typed so a mismatched deps object is a compile error, not a silent `any`.
 */
export function createWindowRegistry(): WindowRegistry {
	const registry = new WindowRegistry();
	registry.register("notebook", (deps) =>
		notebookWindow(deps as NotebookWindowDeps),
	);
	registry.register("workspace", (deps) =>
		workspaceWindow(deps as WorkspaceWindowDeps),
	);
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
