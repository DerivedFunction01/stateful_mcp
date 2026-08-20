import {
	type KeymapBindingContextDto,
	type KeymapBindingDto,
	matchEffectiveBindings,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { normalizeBrowserChord } from "./bindings";
import { classifyChord, normalizePrimary } from "./browser-shortcut-policy";
import { BROWSER_WORKBENCH_BASELINE } from "./browser-workbench-defaults";

export type BindingContextId =
	| "global"
	| `surface:${string}`
	| `component:${string}`
	| `vim:${string}`;

type EffectiveSource =
	| "macro-profile"
	| "browser-baseline"
	| "user-override"
	| "extension";

interface ResolvedBinding {
	readonly command: string;
	readonly source: EffectiveSource;
}

export type KeymapAnnouncement =
	| { readonly key: "chord.cancelled" }
	| { readonly key: "chord.prefix"; readonly chord: string }
	| { readonly key: "chord.timeout" }
	| { readonly key: "shortcut.unavailable"; readonly chord: string }
	| { readonly key: "shortcut.conditional"; readonly chord: string };

export interface KeymapControllerOptions {
	readonly getSnapshot: () => WorkspaceSnapshot | undefined;
	readonly getContext: () => {
		readonly context: KeymapBindingContextDto;
		readonly editorFocused: boolean;
	};
	readonly onCommand: (command: string) => Promise<void> | void;
	readonly onEditorKeyDown?: (event: KeyboardEvent) => boolean;
	readonly onCommandError?: (error: unknown) => void;
	readonly announce?: (announcement: KeymapAnnouncement) => void;
}

const MULTI_CHORD_TIMEOUT_MS = 1200;

function isEditableTarget(target: EventTarget | null): boolean {
	if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement))
		return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA") return true;
	if (target.isContentEditable) return true;
	return false;
}

/**
 * Browser-only event controller. It owns DOM event lifecycle and active-context
 * discovery; it does NOT own command definitions, profile semantics, or durable
 * keymap state. Resolution uses the canonical `matchEffectiveBindings` matcher
 * imported from the browser-safe shared protocol matcher so React never
 * duplicates the keymap matcher or imports Bun runtime code.
 */
export class BrowserKeymapController {
	private readonly options: KeymapControllerOptions;
	private readonly handler: (event: KeyboardEvent) => void;
	private attachedTarget: Window | HTMLElement | undefined;
	private pendingChord: string | null = null;
	private pendingTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;

	constructor(options: KeymapControllerOptions) {
		this.options = options;
		this.handler = (event: KeyboardEvent) => this.onKeyDown(event);
	}

	attach(target: Window | HTMLElement = window): void {
		this.attachedTarget = target;
		target.addEventListener("keydown", this.handler as EventListener, true);
	}

	dispose(): void {
		this.disposed = true;
		this.attachedTarget?.removeEventListener(
			"keydown",
			this.handler as EventListener,
			true,
		);
		this.attachedTarget = undefined;
		this.clearPending();
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (this.disposed) return;
		// `alt`/`Option` is not a first-class canonical modifier. Browser Alt
		// combos are OS/chrome-owned; never treat them as Macro bindings.
		if (event.altKey) return;
		const chord = normalizeBrowserChord(event);
		if (!chord) return;

		// Preserve native text editing unless an opted-in editor context claims
		// the binding.
		if (
			isEditableTarget(event.target) &&
			!this.options.getContext().editorFocused
		)
			return;
		if (
			this.options.getContext().editorFocused &&
			this.options.onEditorKeyDown?.(event)
		) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (event.key === "Escape") {
			if (this.pendingChord) {
				this.clearPending();
				this.options.announce?.({ key: "chord.cancelled" });
			}
			return;
		}

		const combined = this.pendingChord
			? `${this.pendingChord} ${chord}`
			: chord;

		const resolved = this.resolveChord(combined);
		if (resolved) {
			this.clearPending();
			this.dispatch(resolved, event, combined);
			return;
		}

		// No match for the combined chord. If we were awaiting a second chord,
		// fall back to treating this as a fresh single binding.
		if (this.pendingChord) {
			this.clearPending();
			const single = this.resolveChord(chord);
			if (single) {
				this.dispatch(single, event, chord);
				return;
			}
		}

		// No single match: maybe this chord is a multi-chord prefix.
		if (this.isPrefix(chord)) {
			this.pendingChord = chord;
			this.options.announce?.({ key: "chord.prefix", chord });
			this.startPendingTimer();
		}
	}

	private buildContexts(snapshot: WorkspaceSnapshot | undefined): {
		ids: BindingContextId[];
		contextMap: Record<string, string | boolean | undefined>;
	} {
		const layout = snapshot?.layout;
		const activeTabId = snapshot?.activeTabId ?? layout?.activeTabId;
		const focusedPane = layout?.focusedPane;
		const ids: BindingContextId[] = ["global"];
		if (activeTabId) ids.push(`surface:${activeTabId}` as BindingContextId);
		if (focusedPane) ids.push(`component:${focusedPane}` as BindingContextId);
		const activeContext = this.options.getContext();
		if (activeContext.editorFocused && activeContext.context.editorMode)
			ids.push(`vim:${activeContext.context.editorMode}` as BindingContextId);
		const contextMap: Record<string, string | boolean | undefined> = {
			...activeContext.context,
			activeTabId,
			focusedPane,
		};
		return { ids, contextMap };
	}

	private resolveChord(chord: string): ResolvedBinding | null {
		const snapshot = this.options.getSnapshot();
		if (!snapshot) return null;
		const { ids, contextMap } = this.buildContexts(snapshot);
		const mode = this.options.getContext().context.editorMode;

		// 1. Effective Macro keymap (profile / user / extension) — highest layer.
		const matched = matchEffectiveBindings(
			snapshot.keymap.bindings as readonly KeymapBindingDto[],
			chord,
			mode,
			contextMap,
		);
		if (matched) {
			const source: EffectiveSource =
				(matched as { source?: EffectiveSource }).source ?? "macro-profile";
			return {
				command: matched.command,
				source,
			};
		}

		// 2. Browser baseline — VS Code-style renderer policy, below profile.
		for (const binding of BROWSER_WORKBENCH_BASELINE) {
			if (
				normalizePrimary(binding.chord) === normalizePrimary(chord) &&
				ids.some((id) => contextMatchesBaseline(binding.context, id))
			) {
				return {
					command: binding.command,
					source: "browser-baseline",
				};
			}
		}
		return null;
	}

	private isPrefix(chord: string): boolean {
		const snapshot = this.options.getSnapshot();
		const bindings = snapshot?.keymap.bindings ?? [];
		const baseline = BROWSER_WORKBENCH_BASELINE;
		const prefix = `${chord} `;
		return (
			bindings.some((b) =>
				b.chords.some((c) => c.toLowerCase().startsWith(prefix)),
			) ||
			baseline.some(
				(b) => b.chord.toLowerCase().startsWith(prefix) && b.chord !== chord,
			)
		);
	}

	private dispatch(
		resolved: ResolvedBinding,
		event: KeyboardEvent,
		chord: string,
	): void {
		const policy = classifyChord(chord);
		// Never claim browser/OS-reserved shortcuts; keep the visible fallback.
		if (
			policy.disposition === "browser-chrome" ||
			policy.disposition === "platform-reserved" ||
			policy.disposition === "unknown"
		) {
			this.options.announce?.({ key: "shortcut.unavailable", chord });
			return;
		}
		if (policy.canPreventDefaultWhenDelivered && event.cancelable) {
			event.preventDefault();
			event.stopPropagation();
		}
		if (policy.disposition === "conditional" || policy.nativeEditing) {
			this.options.announce?.({ key: "shortcut.conditional", chord });
		}
		void Promise.resolve(this.options.onCommand(resolved.command)).catch(
			(error: unknown) => this.options.onCommandError?.(error),
		);
	}

	private startPendingTimer(): void {
		this.clearPendingTimer();
		this.pendingTimer = setTimeout(() => {
			this.pendingChord = null;
			this.options.announce?.({ key: "chord.timeout" });
		}, MULTI_CHORD_TIMEOUT_MS);
	}

	private clearPending(): void {
		this.clearPendingTimer();
		this.pendingChord = null;
	}

	private clearPendingTimer(): void {
		if (this.pendingTimer !== undefined) {
			clearTimeout(this.pendingTimer);
			this.pendingTimer = undefined;
		}
	}
}

function contextMatchesBaseline(
	bindingContext: string,
	activeId: BindingContextId,
): boolean {
	if (bindingContext === "global") return activeId === "global";
	if (bindingContext.startsWith("surface:")) {
		const suffix = bindingContext.slice("surface:".length);
		return activeId === `surface:${suffix}` || suffix === "*";
	}
	if (bindingContext.startsWith("component:")) {
		const suffix = bindingContext.slice("component:".length);
		return activeId === `component:${suffix}` || suffix === "*";
	}
	if (bindingContext.startsWith("vim:")) {
		const suffix = bindingContext.slice("vim:".length);
		return activeId === `vim:${suffix}` || suffix === "*";
	}
	return false;
}

export type { KeymapBindingDto };
