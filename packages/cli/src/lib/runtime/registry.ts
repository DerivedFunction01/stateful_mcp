import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type {
	CommandContribution,
	CompletionContribution,
	EditorExtension,
	EffectHandler,
	IntentHandler,
	KeybindingContribution,
	RegionContribution,
	WindowEffect,
	WindowExtensionContext,
	WindowIntent,
	WindowScope,
} from "./extension";

interface Registered<T> {
	scope: WindowScope | null;
	value: T;
}

function matchesScope<T extends { windows?: string[] }>(
	value: T | undefined,
	scope: WindowScope | null,
): boolean {
	if (!scope || !value || !("windows" in ((value as any) ?? {}))) return true;
	const windows = (value as any).windows as string[] | undefined;
	if (!windows || windows.length === 0) return true;
	return windows.includes(scope.windowKind);
}

/**
 * Window-scoped extension registries. Each registry is bound to an optional
 * window scope; entries registered against a scope only resolve when active for
 * that scope, preventing cross-window catalog leakage.
 */
export class ScopedRegistry<T> {
	private readonly entries: (Registered<T> & { order: number })[] = [];
	private nextOrder = 0;

	register(scope: WindowScope | null, value: T): void {
		this.entries.push({ scope, value, order: this.nextOrder++ });
	}

	all(scope: WindowScope | null): T[] {
		return this.entries
			.filter((e) => {
				if (e.scope && scope && e.scope.windowKind !== scope.windowKind)
					return false;
				if (e.scope && !scope) return false;
				return true;
			})
			.sort((a, b) => a.order - b.order)
			.map((e) => e.value);
	}

	clear(): void {
		this.entries.length = 0;
		this.nextOrder = 0;
	}
}

export class IntentHandlerRegistry {
	private readonly handlers: IntentHandler[] = [];

	register(handler: IntentHandler, _scope: WindowScope): void {
		this.handlers.push(handler);
	}

	resolve(intentType: string): IntentHandler[] {
		return this.handlers.filter((h) => h.intentTypes.includes(intentType));
	}
}

export class EffectHandlerRegistry {
	private readonly handlers: EffectHandler[] = [];

	register(handler: EffectHandler, _scope: WindowScope): void {
		this.handlers.push(handler);
	}

	resolve(effectType: string): EffectHandler[] {
		return this.handlers.filter((h) => h.effectTypes.includes(effectType));
	}
}

/**
 * Collection of scoped registries for one active window session.
 */
export class ExtensionRegistry {
	commands: ScopedRegistry<CommandContribution>;
	keybindings: ScopedRegistry<KeybindingContribution>;
	completions: ScopedRegistry<CompletionContribution>;
	regions: ScopedRegistry<RegionContribution>;
	intentHandlers: IntentHandlerRegistry;
	effectHandlers: EffectHandlerRegistry;

	private readonly extensions: EditorExtension[] = [];

	constructor() {
		this.commands = new ScopedRegistry<CommandContribution>();
		this.keybindings = new ScopedRegistry<KeybindingContribution>();
		this.completions = new ScopedRegistry<CompletionContribution>();
		this.regions = new ScopedRegistry<RegionContribution>();
		this.intentHandlers = new IntentHandlerRegistry();
		this.effectHandlers = new EffectHandlerRegistry();
	}

	/** Register an extension's contributions for the given window scope. */
	registerExtension(ext: EditorExtension, scope: WindowScope): void {
		this.extensions.push(ext);
		if (!matchesScope(ext, scope)) return;
		ext.commands?.forEach((c) => this.commands.register(scope, c));
		ext.keybindings?.forEach((k) => this.keybindings.register(scope, k));
		ext.completion?.forEach((c) => this.completions.register(scope, c));
		ext.regions?.forEach((r) => this.regions.register(scope, r));
		ext.intentHandlers?.forEach((h) => this.intentHandlers.register(h, scope));
		ext.effectHandlers?.forEach((h) => this.effectHandlers.register(h, scope));
	}

	commandsFor(scope: WindowScope): CommandContribution[] {
		return this.commands.all(scope);
	}

	keybindingsFor(scope: WindowScope): KeybindingContribution[] {
		return this.keybindings
			.all(scope)
			.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
	}

	completionsFor(scope: WindowScope): CompletionContribution[] {
		return this.completions.all(scope);
	}

	regionsFor(scope: WindowScope): RegionContribution[] {
		return this.regions
			.all(scope)
			.filter((r) => (r.visibleWhen ? r.visibleWhen(scope) : true))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}

	clear(): void {
		this.extensions.length = 0;
		this.commands.clear();
		this.keybindings.clear();
		this.completions.clear();
		this.regions.clear();
	}
}

export interface DispatchResult {
	effects: WindowEffect[];
}

export class IntentDispatcher {
	constructor(private readonly registry: ExtensionRegistry) {}

	async dispatch(
		intent: WindowIntent,
		ctx: WindowExtensionContext,
	): Promise<WindowEffect[]> {
		const handlers = this.registry.intentHandlers.resolve(intent.id);
		const effects: WindowEffect[] = [];
		for (const h of handlers) {
			const out = await h.handle(intent, ctx);
			effects.push(...(Array.isArray(out) ? out : []));
		}
		return effects;
	}
}

export function autocompleteFromCommands(
	partial: string,
	commands: CommandContribution[],
	source: "editor" | "cell",
): AutocompleteSuggestion[] {
	if (!partial) return [];
	const seen = new Set<string>();
	const out: AutocompleteSuggestion[] = [];
	const partialLower = partial.toLowerCase();
	for (const c of commands) {
		const canonicalVerb = c.id.toLowerCase();
		if (seen.has(canonicalVerb)) continue;

		const names = [c.id, ...(c.aliases ?? [])];
		const hasPrefixMatch = names.some((name) => name.toLowerCase().startsWith(partialLower));

		if (hasPrefixMatch) {
			seen.add(canonicalVerb);
			out.push({
				verb: c.id,
				group: c.group,
				source,
				hasArgs: c.args.length > 0,
				argNames: c.args.map((a) => a.name),
				argHints: c.args.map((a) => a.completions ?? []),
				argsRequired: c.args.map((a) => a.required),
				kind: "verb",
				descriptionKey: c.descriptionKey,
			});
			if (out.length >= 12) return out;
		}
	}
	return out;
}
