import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
} from "../contracts/extension-config";
import {
	parseValueRecipes,
	type RecipeCandidate,
	type RecipeOutputBuilder,
	type RecipeParseResult,
	type TerminalParser,
} from "./recipes";

export interface ValueEngineOptions {
	readonly terminals: Readonly<Record<string, TerminalParser>>;
	readonly outputBuilders?: Readonly<Record<string, RecipeOutputBuilder>>;
	readonly context?: Readonly<Record<string, unknown>>;
	readonly terminalPolicy?: CompiledArgumentPolicy;
	readonly allowedConsumerId?: string;
}

export interface ConfiguredValueRuntime extends ValueEngineOptions {
	readonly grammar: CompiledDomainGrammar;
	readonly policies?: Readonly<Record<string, CompiledArgumentPolicy>>;
	readonly context?: Readonly<Record<string, unknown>>;
	/** Changes whenever the compiled profile/runtime artifact is replaced. */
	readonly fingerprint?: string;
}

export interface ConfiguredValueMatch {
	readonly candidate: RecipeCandidate;
	readonly start: number;
	readonly end: number;
	readonly rawText: string;
}

/**
 * Runs the compiled profile path. There is no domain fallback here: an input
 * is recognized only by an enabled recipe and one of its terminal parsers.
 */
export function parseConfiguredValue(
	input: string,
	grammar: CompiledDomainGrammar,
	policy: Pick<CompiledArgumentPolicy, "enabledRecipes" | "priorityOverrides">,
	options: ValueEngineOptions,
): RecipeParseResult {
	if (grammar.valid === false) {
		return {
			candidates: [],
			ambiguous: false,
			diagnostics: grammar.diagnostics,
		};
	}
	const parsers: Readonly<Record<string, TerminalParser>> = options.terminals;
	const terminalDiagnostics = [] as RecipeParseResult["diagnostics"][number][];
	const result = parseValueRecipes(
		input,
		grammar.recipes?.recipes ?? [],
		{
			enabledRecipes: policy.enabledRecipes ?? [],
			priorityOverrides: policy.priorityOverrides,
		},
		(consumerId, value, request) => {
			const parser = parsers[consumerId];
			if (
				options.allowedConsumerId !== undefined &&
				consumerId !== options.allowedConsumerId
			)
				return { valid: false };
			if (!parser) return { valid: false };
			try {
				const parsed = parser(consumerId, value, {
					...request,
					consumerId,
					input: value,
					grammar,
					policy: options.terminalPolicy,
					context: options.context,
				});
				if (!parsed.valid)
					terminalDiagnostics.push(...(parsed.diagnostics ?? []));
				return parsed;
			} catch {
				const failure = {
					errorCode: "TERMINAL_FAILURE",
					messageKey: "values.terminal.failure",
					messageParams: { consumerId },
				};
				terminalDiagnostics.push(failure);
				return { valid: false, diagnostics: [failure] };
			}
		},
		options.outputBuilders,
	);
	return {
		...result,
		diagnostics: Object.freeze([...result.diagnostics, ...terminalDiagnostics]),
	};
}

/** Parse one complete value using the policy attached to a macro argument. */
export function parseConfiguredArgument(
	input: string,
	runtime: ConfiguredValueRuntime,
	argumentId: string,
	consumerId?: string,
): RecipeParseResult {
	const policy = runtime.policies?.[argumentId];
	return parseConfiguredValue(
		input,
		runtime.grammar,
		{
			enabledRecipes: policy?.enabledRecipes ?? [],
			priorityOverrides: policy?.priorityOverrides,
		},
		{
			...runtime,
			terminalPolicy: policy,
			allowedConsumerId: consumerId ?? runtime.allowedConsumerId,
		},
	);
}

/**
 * Parse only the caller-provided candidate regions. The engine never searches
 * arbitrary text or broadens a region after a terminal rejects it.
 */
export function findConfiguredValueMatches(
	raw: string,
	runtime: ConfiguredValueRuntime,
	argumentId: string,
	regions: readonly { start: number; end: number }[],
	consumerId?: string,
): readonly ConfiguredValueMatch[] {
	return regions.flatMap((region) => {
		if (
			region.start < 0 ||
			region.end > raw.length ||
			region.end <= region.start
		)
			return [];
		const result = parseConfiguredArgument(
			raw.slice(region.start, region.end),
			runtime,
			argumentId,
			consumerId,
		);
		return result.candidates.map((candidate) => ({
			candidate,
			start: region.start,
			end: region.end,
			rawText: raw.slice(region.start, region.end),
		}));
	});
}
