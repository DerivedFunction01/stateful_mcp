import type { RecipeParseResult } from "../recipes";
import { parseValueRecipes, parseValueRecipesAsync } from "../recipes";
import type {
	AsyncValueEngineOptions,
	ConfiguredValueRuntime,
	ValueEngineOptions,
} from "./types";

export function parseConfiguredValue(
	input: string,
	grammar: ConfiguredValueRuntime["grammar"],
	policy: NonNullable<ValueEngineOptions["terminalPolicy"]>,
	options: ValueEngineOptions,
): RecipeParseResult {
	if (grammar.valid === false)
		return {
			candidates: [],
			ambiguous: false,
			diagnostics: grammar.diagnostics,
		};
	const terminalDiagnostics = [] as RecipeParseResult["diagnostics"][number][];
	const result = parseValueRecipes(
		input,
		grammar.recipes?.recipes ?? [],
		{
			enabledRecipes: policy.enabledRecipes ?? [],
			priorityOverrides: policy.priorityOverrides,
		},
		(consumerId, value, request) => {
			const parser = options.terminals[consumerId];
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
		{ grammar, policy, context: options.context },
	);
	return {
		...result,
		diagnostics: Object.freeze([...result.diagnostics, ...terminalDiagnostics]),
	};
}

export async function parseConfiguredValueAsync(
	input: string,
	grammar: ConfiguredValueRuntime["grammar"],
	policy: NonNullable<ValueEngineOptions["terminalPolicy"]>,
	options: AsyncValueEngineOptions,
): Promise<RecipeParseResult> {
	if (grammar.valid === false)
		return {
			candidates: [],
			ambiguous: false,
			diagnostics: grammar.diagnostics,
		};
	return parseValueRecipesAsync(
		input,
		grammar.recipes?.recipes ?? [],
		{
			enabledRecipes: policy.enabledRecipes ?? [],
			priorityOverrides: policy.priorityOverrides,
		},
		async (consumerId, value, request) => {
			const parser = options.terminals[consumerId];
			if (
				!parser ||
				(options.allowedConsumerId !== undefined &&
					consumerId !== options.allowedConsumerId)
			)
				return { valid: false };
			try {
				return await parser(consumerId, value, {
					...request,
					consumerId,
					input: value,
					grammar,
					policy: options.terminalPolicy,
					context: options.context,
				});
			} catch {
				return {
					valid: false,
					diagnostics: [
						{
							errorCode: "TERMINAL_FAILURE",
							messageKey: "values.terminal.failure",
							messageParams: { consumerId },
						},
					],
				};
			}
		},
		options.outputBuilders,
		{ grammar, policy, context: options.context },
	);
}

export async function parseConfiguredArgumentAsync(
	input: string,
	runtime: Omit<ConfiguredValueRuntime, "terminals"> & {
		readonly terminals: AsyncValueEngineOptions["terminals"];
	},
	argumentId: string,
	consumerId?: string,
): Promise<RecipeParseResult> {
	const policy = runtime.policies?.[argumentId] ?? {};
	return parseConfiguredValueAsync(input, runtime.grammar, policy, {
		...runtime,
		terminalPolicy: policy,
		allowedConsumerId: consumerId ?? runtime.allowedConsumerId,
	});
}

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
		policy ?? { enabledRecipes: [] },
		{
			...runtime,
			terminalPolicy: policy,
			allowedConsumerId: consumerId ?? runtime.allowedConsumerId,
		},
	);
}
