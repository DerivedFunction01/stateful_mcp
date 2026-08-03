import type {
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "./extension";
import { IntentCatalog } from "./intent-catalog";
import { ExtensionRegistry, IntentDispatcher } from "./registry";

export interface WindowRuntime {
	scope: WindowScope;
	registry: ExtensionRegistry;
	catalog: IntentCatalog;
	dispatcher: IntentDispatcher;
	applyEffects(effects: WindowEffect[]): void;
}

export interface WindowProfileDefinition {
	kind: string;
	extensions: EditorExtension[];
	scope: WindowScope;
	/** Applies window-level effects (router, document, editor, app). */
	effectHandler?: (effect: WindowEffect, ctx: WindowRuntime) => void;
}

/**
 * Builds a window runtime from a profile: registers the profile's extensions
 * against the window scope and exposes the catalog + dispatcher, with an
 * effect sink supplied by the host.
 */
export function createWindowRuntime(
	def: WindowProfileDefinition,
	applyEffects: (effects: WindowEffect[]) => void,
): WindowRuntime {
	const registry = new ExtensionRegistry();
	for (const ext of def.extensions) {
		registry.registerExtension(ext, def.scope);
	}
	const catalog = new IntentCatalog(registry);
	const dispatcher = new IntentDispatcher(registry);
	return {
		scope: def.scope,
		registry,
		catalog,
		dispatcher,
		applyEffects,
	};
}

export async function runIntent(
	runtime: WindowRuntime,
	intent: WindowIntent,
	ctx: any,
): Promise<void> {
	const effects = await runtime.dispatcher.dispatch(intent, ctx);
	runtime.applyEffects(effects);
}
