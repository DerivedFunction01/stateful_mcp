import type {
	EditorMode,
	KeymapBindingContextDto,
} from "@stateful-mcp/macro-protocol";
import {
	createContext,
	useContext,
	useMemo,
	useSyncExternalStore,
} from "react";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimKeyboardEvent,
} from "./browser-vim";

export interface EditorSurfaceRegistration {
	readonly id: string;
	readonly element: HTMLElement;
	readonly focused: boolean;
	readonly context: KeymapBindingContextDto;
	readonly vimEnabled: boolean;
	readonly mode?: EditorMode;
	readonly adapter?: BrowserEditorSurfaceAdapter;
	readonly handleKeyDown?: (event: BrowserVimKeyboardEvent) => boolean;
}

type Listener = () => void;

/**
 * Browser-owned editor-surface registry. It holds presentation/runtime
 * ownership state (which surfaces exist, which one is focused, what mode it
 * reports) and nothing else. It does NOT own scratchpad text, line
 * projections, diagnostics, or command execution — the host does.
 *
 * This replaces the brittle `document.activeElement?.closest("[data-editor-surface]")`
 * DOM probe. The keymap controller and status bar read the active surface from
 * here rather than inferring editor state from route or keymap presence.
 */
export class EditorSurfaceRegistry {
	private readonly surfaces = new Map<string, EditorSurfaceRegistration>();
	private readonly focusOrder = new Map<string, number>();
	private readonly listeners = new Set<Listener>();
	private focusSequence = 0;

	register(registration: EditorSurfaceRegistration): void {
		this.surfaces.set(registration.id, registration);
		if (registration.focused)
			this.focusOrder.set(registration.id, ++this.focusSequence);
		this.emit();
	}

	update(id: string, patch: Partial<EditorSurfaceRegistration>): void {
		const existing = this.surfaces.get(id);
		if (!existing) return;
		this.surfaces.set(id, { ...existing, ...patch });
		if (patch.focused === true) this.focusOrder.set(id, ++this.focusSequence);
		this.emit();
	}

	unregister(id: string): void {
		if (this.surfaces.delete(id)) {
			this.focusOrder.delete(id);
			this.emit();
		}
	}

	/** The focused registered surface, if any. Reads are synchronous. */
	getActive(): EditorSurfaceRegistration | undefined {
		let active: EditorSurfaceRegistration | undefined;
		let latestFocus = -1;
		for (const surface of this.surfaces.values()) {
			const focusedAt = this.focusOrder.get(surface.id) ?? -1;
			if (surface.focused && focusedAt > latestFocus) {
				active = surface;
				latestFocus = focusedAt;
			}
		}
		return active;
	}

	list(): readonly EditorSurfaceRegistration[] {
		return [...this.surfaces.values()];
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

export const EditorSurfaceRegistryContext =
	createContext<EditorSurfaceRegistry | null>(null);

export function useEditorSurfaceRegistry(): EditorSurfaceRegistry {
	const registry = useContext(EditorSurfaceRegistryContext);
	if (!registry) {
		throw new Error(
			"useEditorSurfaceRegistry must be used within an EditorSurfaceRegistryContext provider",
		);
	}
	return registry;
}

/**
 * Reactive view of the active (focused) editor surface for components such as
 * the status bar. Returns undefined when no registered surface owns focus.
 */
export function useActiveEditorSurface():
	| EditorSurfaceRegistration
	| undefined {
	const registry = useEditorSurfaceRegistry();
	return useSyncExternalStore(
		useMemo(() => registry.subscribe.bind(registry), [registry]),
		() => registry.getActive(),
		() => registry.getActive(),
	);
}
