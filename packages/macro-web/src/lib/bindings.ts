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

export function normalizeBrowserChord(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string {
	const modifiers: string[] = [];
	if (event.ctrlKey) modifiers.push("ctrl");
	if (event.metaKey) modifiers.push("meta");
	if (event.altKey) modifiers.push("alt");
	if (event.shiftKey) modifiers.push("shift");
	const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase().replace(/^arrow/, "");
	return [...modifiers, key || event.code.toLowerCase()].join("+");
}

export function resolveBrowserBinding(
	chord: string,
	contexts: readonly BindingContext[],
): BindingDispatchResult {
	return dispatchBinding(chord, contexts);
}

export function resolveKeymapCommand(
	chord: string,
	keymap: { readonly bindings: readonly { readonly command: string; readonly chords: readonly string[]; readonly modes?: readonly string[]; readonly when?: unknown }[] },
	mode = "NORMAL",
	context: Readonly<Record<string, string | boolean | undefined>> = {},
): string | undefined {
	const normalized = chord.toLowerCase();
	return keymap.bindings.find((binding) =>
		(!binding.modes || binding.modes.includes(mode)) &&
		contextExpressionMatches(binding.when, context) &&
		binding.chords.some((candidate) => candidate.toLowerCase() === normalized),
	)?.command;
}

function contextExpressionMatches(expression: unknown, context: Readonly<Record<string, string | boolean | undefined>>): boolean {
	if (!expression || typeof expression !== "object") return true;
	const value = expression as { key?: string; equals?: string | boolean; allOf?: readonly unknown[]; anyOf?: readonly unknown[]; not?: unknown };
	if (value.key) return String(context[value.key]) === String(value.equals);
	if (value.allOf) return value.allOf.every((item) => contextExpressionMatches(item, context));
	if (value.anyOf) return value.anyOf.some((item) => contextExpressionMatches(item, context));
	if (value.not) return !contextExpressionMatches(value.not, context);
	return true;
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
