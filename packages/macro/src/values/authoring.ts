import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import { compileDomainConfig } from "../extensions/config";
import { stableSerialize } from "../shared/deterministic-json";
import {
	compileAuthoredCurrencyTemplates,
	createCurrencyOutputBuilders,
} from "./currency";
import { createDateTimeRecipeSet } from "./date-time";
import { createFrequencyRecipeSet } from "./frequency";
import type { FundamentalGroup } from "./fundamentals";
import {
	compileAuthoredQuantityTemplates,
	createQuantityOutputBuilders,
} from "./quantity";
import {
	compileAuthoredRateTemplates,
	createRateOutputBuilders,
} from "./rates";
import type { RecipeOutputBuilder, ValueRecipe } from "./recipes";

export interface AuthoredValueRecipeSet {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
	readonly outputBuilders: Readonly<Record<string, RecipeOutputBuilder>>;
}

/** Creates the explicit recipe graph implied by configured value templates. */
export function createAuthoredValueRecipeSet(
	values: UserMacroProfile["values"] = {},
): AuthoredValueRecipeSet {
	const quantity = values.quantity
		? compileAuthoredQuantityTemplates(values.quantity as never)
		: { fundamentals: [], recipes: [] };
	const currency = values.currency
		? compileAuthoredCurrencyTemplates(values.currency as never)
		: { fundamentals: [], recipes: [] };
	const rates = values.rates
		? compileAuthoredRateTemplates(values.rates as never)
		: { fundamentals: [], recipes: [] };
	const frequency = values.frequency
		? createFrequencyRecipeSet(values.frequency as never)
		: { fundamentals: [], recipes: [], outputBuilders: {} };
	const dateTime = values.dateTime
		? createDateTimeRecipeSet(values.dateTime as never)
		: { fundamentals: [], recipes: [], outputBuilders: {} };
	return {
		fundamentals: [
			...quantity.fundamentals,
			...currency.fundamentals,
			...rates.fundamentals,
			...frequency.fundamentals,
			...dateTime.fundamentals,
		],
		recipes: [
			...quantity.recipes,
			...currency.recipes,
			...rates.recipes,
			...frequency.recipes,
			...dateTime.recipes,
		],
		outputBuilders: {
			...createQuantityOutputBuilders(),
			...(values.currency ? createCurrencyOutputBuilders(values.currency) : {}),
			...(values.rates ? createRateOutputBuilders(values.rates) : {}),
			...frequency.outputBuilders,
			...dateTime.outputBuilders,
		},
	};
}

/**
 * The declarative value graph persisted by a profile or extension. Runtime
 * code compiles this data; it never supplies domain templates of its own.
 */
export type AuthoredValueGraph = Pick<
	UserMacroProfile,
	| "fundamentals"
	| "aliases"
	| "aliasResolvers"
	| "recipes"
	| "values"
	| "unitAliases"
	| "localization"
	| "numberWords"
	| "removedIds"
>;

export interface AuthoredValueGraphCompilation {
	readonly grammar: CompiledDomainGrammar;
	readonly valid: boolean;
	readonly diagnostics: CompiledDomainGrammar["diagnostics"];
	readonly fingerprint: string;
}

const COMPILED_GRAPH_CACHE = new Map<string, AuthoredValueGraphCompilation>();
const MAX_COMPILED_GRAPH_CACHE_SIZE = 100;

export function clearCompiledGraphCache(): void {
	COMPILED_GRAPH_CACHE.clear();
}

/** Stable identity for authored data; object key order does not affect it. */
export function authoredValueGraphFingerprint(graph: UserMacroProfile): string {
	return `authored-values-v1-${fnv1a(stableSerialize(stripRuntimeResolvers(graph)))}`;
}

/**
 * Compiles only user-authored graph data with LRU caching by fingerprint.
 */
export function compileAuthoredValueGraph(
	graph: UserMacroProfile,
): AuthoredValueGraphCompilation {
	const fingerprint = authoredValueGraphFingerprint(graph);
	const cached = COMPILED_GRAPH_CACHE.get(fingerprint);
	if (cached) return cached;

	const grammar = compileDomainConfig(graph);
	const result: AuthoredValueGraphCompilation = {
		grammar,
		valid: grammar.valid && (grammar.recipes?.recipes.length ?? 0) > 0,
		diagnostics: grammar.diagnostics,
		fingerprint,
	};
	if (COMPILED_GRAPH_CACHE.size >= MAX_COMPILED_GRAPH_CACHE_SIZE) {
		const firstKey = COMPILED_GRAPH_CACHE.keys().next().value;
		if (firstKey !== undefined) COMPILED_GRAPH_CACHE.delete(firstKey);
	}
	COMPILED_GRAPH_CACHE.set(fingerprint, result);
	return result;
}

function stripRuntimeResolvers<T>(value: T): T {
	if (Array.isArray(value)) return value.map(stripRuntimeResolvers) as T;
	if (!value || typeof value !== "object") return value;
	const record = value as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(record)) {
		if (key === "aliasResolvers") continue;
		if (typeof child === "function") continue;
		result[key] = stripRuntimeResolvers(child);
	}
	return result as T;
}

function fnv1a(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
