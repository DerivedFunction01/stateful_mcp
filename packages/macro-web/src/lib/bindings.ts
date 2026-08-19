export type BindingContextId =
	| "global"
	| `surface:${string}`
	| `component:${string}`
	| `vim:${string}`;

export interface CommandBinding {
	readonly command: string;
	readonly shortcut: string;
	readonly context: BindingContextId;
	readonly when?: string;
}

export interface BindingContext {
	readonly id: BindingContextId;
	readonly active: boolean;
	readonly bindings: readonly CommandBinding[];
}

export interface BindingDispatchResult {
	readonly handled: boolean;
	readonly command?: string;
}

/**
 * Normalize a DOM key event into a canonical chord string. Modifiers are
 * `ctrl`/`meta`/`shift` only; `alt`/`Option` is intentionally dropped because it
 * is not a first-class canonical modifier and browser Alt combos are
 * OS/chrome-owned. The browser keymap controller rejects Alt events entirely.
 */
export function normalizeBrowserChord(
	event: Pick<
		KeyboardEvent,
		"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
	>,
): string {
	const modifiers: string[] = [];
	if (event.ctrlKey) modifiers.push("ctrl");
	if (event.metaKey) modifiers.push("meta");
	if (event.shiftKey) modifiers.push("shift");
	const key =
		event.key.length === 1
			? event.key.toLowerCase()
			: event.key.toLowerCase().replace(/^arrow/, "");
	return [...modifiers, key || event.code.toLowerCase()].join("+");
}

export function resolveBrowserBinding(
	chord: string,
	contexts: readonly BindingContext[],
): BindingDispatchResult {
	return dispatchBinding(chord, contexts);
}

export function dispatchBinding(
	shortcut: string,
	contexts: readonly BindingContext[],
): BindingDispatchResult {
	for (const context of contexts) {
		if (!context.active) continue;
		const binding = context.bindings.find((item) => item.shortcut === shortcut);
		if (binding) return { handled: true, command: binding.command };
	}
	return { handled: false };
}
