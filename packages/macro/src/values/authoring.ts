import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import { compileDomainConfig } from "../extensions/config";
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
>;

export interface AuthoredValueGraphCompilation {
	readonly grammar: CompiledDomainGrammar;
	readonly valid: boolean;
	readonly diagnostics: CompiledDomainGrammar["diagnostics"];
}

/**
 * Compiles only user-authored graph data. Empty graph data remains empty at
 * the recognition layer because recipes must be explicitly enabled by the
 * consuming argument.
 */
export function compileAuthoredValueGraph(
	graph: AuthoredValueGraph,
): AuthoredValueGraphCompilation {
	const grammar = compileDomainConfig(graph);
	return {
		grammar,
		valid: grammar.valid && (grammar.recipes?.recipes.length ?? 0) > 0,
		diagnostics: grammar.diagnostics,
	};
}
