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
