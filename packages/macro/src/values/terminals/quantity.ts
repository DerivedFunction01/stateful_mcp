import { createCompoundQuantityOutputBuilder } from "../compound";
import { checkNumericBounds, parseNumericValue } from "../numeric";
import { resolveOperator } from "../operators";
import type { QuantityGrammarResult } from "../quantity";
import {
	compileAuthoredQuantityTemplates,
	createQuantityOutputBuilders,
	resolveUnitAlias,
} from "../quantity";
import {
	type CompiledRecipe,
	compileValueRecipes,
	parseValueRecipes,
	type TerminalParser,
} from "../recipes";
import { resolveStatisticalQualifier } from "../statistics";
import { diagnostics, result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createQuantityTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	const terminals: Record<string, TerminalParser> = {
		number: (_id, input, request) => {
			const parsed = parseNumericValue(
				input,
				(request?.grammar ?? grammar).quantity.numericConfig,
			);
			return result(parsed.parsed, parsed.diagnostics);
		},
		quantity: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			let quantityRecipes: readonly CompiledRecipe[] = (
				activeGrammar.recipes?.recipes ?? []
			).filter(
				(recipe) =>
					recipe.outputBuilderId?.startsWith("quantity.") &&
					recipe.outputBuilderId !== "quantity.range",
			);
			if (quantityRecipes.length === 0) {
				const authored = compileAuthoredQuantityTemplates({
					...activeGrammar.quantity,
					templates: activeGrammar.quantity.templates?.length
						? activeGrammar.quantity.templates
						: ["NUM UNIT"],
				});
				quantityRecipes = compileValueRecipes(
					authored.fundamentals,
					authored.recipes,
					{
						outputBuilderIds: new Set([
							"quantity.template",
							"quantity.compound",
						]),
					},
				).recipes;
			}
			const policy = request?.policy ?? {};
			const parsed = parseValueRecipes(
				input,
				quantityRecipes,
				{
					// A quantity terminal is used as a child of compound/range recipes;
					// the parent recipe policy must not disable its constituent recipes.
					enabledRecipes: quantityRecipes.map((recipe) => recipe.id),
					priorityOverrides: policy.priorityOverrides,
				},
				(consumerId, value, nestedRequest) => {
					const parser = terminals[consumerId];
					if (!parser) return { valid: false };
					return parser(consumerId, value, {
						...nestedRequest,
						consumerId,
						input: value,
						grammar: activeGrammar,
						policy,
					});
				},
				{
					...createQuantityOutputBuilders(),
					"quantity.compound": createCompoundQuantityOutputBuilder(),
				},
				{ grammar: activeGrammar, policy },
			);
			const parsedValue = parsed.selected?.canonicalValue as
				| QuantityGrammarResult
				| undefined;
			if (
				parsedValue &&
				request?.policy?.bounds &&
				!checkNumericBounds(
					parsedValue.primaryQuantity.magnitude,
					request.policy.bounds,
				)
			) {
				return {
					valid: false,
					diagnostics: [
						{
							errorCode: "NUMERIC_BOUNDS",
							messageKey: "values.numeric.outOfBounds",
							messageParams: request.policy.path
								? { argumentId: request.policy.path }
								: undefined,
						},
					],
				};
			}
			return result(parsedValue, parsed.diagnostics);
		},
		"quantity-amount": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const parsed = parseNumericValue(input, config);
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"quantity-unit": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const resolved = resolveUnitAlias(
				input,
				config.unitAliases,
				config.locales,
			);
			return resolved
				? {
						valid: true,
						value: resolved.canonicalUnit,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
					}
				: Object.keys(config.unitAliases ?? {}).length === 0 && input.trim()
					? result(input.trim(), [])
					: { valid: false, stable: true };
		},
		"quantity-packaging": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			if (Array.isArray(config.packagingClassifiers)) {
				return config.packagingClassifiers.some(
					(alias) =>
						alias.toLocaleLowerCase(config.locales as string) === normalized,
				)
					? result(input.trim(), [])
					: { valid: false, stable: true };
			}
			const entries = Object.entries(config.packagingClassifiers ?? {}) as [
				string,
				readonly string[],
			][];
			for (const [canonical, aliases] of entries) {
				if (
					canonical.toLocaleLowerCase(config.locales as string) ===
						normalized ||
					(typeof aliases !== "string" &&
						aliases.some(
							(alias) =>
								alias.toLocaleLowerCase(config.locales as string) ===
								normalized,
						))
				)
					return result(canonical, []);
			}
			return { valid: false, stable: true };
		},
		"quantity-filler": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			return config.fillerConnectors?.some(
				(alias) =>
					alias.toLocaleLowerCase(config.locales as string) === normalized,
			)
				? result(input.trim(), [])
				: { valid: false, stable: true };
		},
		unit: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const resolved = resolveUnitAlias(
				input,
				activeGrammar.quantity.unitAliases,
				activeGrammar.quantity.locales,
			);
			return resolved
				? {
						valid: true,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
						stable: true,
					}
				: { valid: false, stable: true };
		},
		operator: (_id, input, request) => {
			const operator = resolveOperator(
				input,
				(request?.grammar ?? grammar).quantity.operatorConfig ?? {},
			);
			return operator
				? {
						valid: true,
						canonicalValue: operator,
						displayValue: input.trim(),
						stable: true,
					}
				: { valid: false, stable: true };
		},
		statistic: (_id, input, request) => {
			const statistic = resolveStatisticalQualifier(
				input,
				(request?.grammar ?? grammar).quantity.statisticalConfig ?? {},
				request?.policy?.quantityConsumerPolicy?.statisticsPolicy,
			);
			return statistic.qualifier
				? {
						valid: true,
						canonicalValue: statistic.qualifier,
						displayValue: input.trim(),
						stable: true,
					}
				: {
						valid: false,
						diagnostics: diagnostics(statistic.diagnostics),
						stable: true,
					};
		},
		"rate-denominator": (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const parsed = terminals.quantity!("quantity", input, request);
			if (parsed.valid && parsed.value) {
				return {
					valid: true,
					value: parsed.value,
					canonicalValue: parsed.canonicalValue ?? parsed.value,
					stable: true,
				};
			}
			const unit = resolveUnitAlias(input, activeGrammar.quantity.unitAliases);
			if (unit) {
				const fallback: QuantityGrammarResult = {
					primaryQuantity: {
						magnitude: 1,
						unit: unit.canonicalUnit,
						rawText: input.trim(),
					},
					rawText: input.trim(),
				};
				return {
					valid: true,
					value: fallback,
					canonicalValue: fallback,
					stable: true,
				};
			}
			return {
				valid: false,
				diagnostics: parsed.diagnostics,
				stable: true,
			};
		},
	};
	return terminals;
}
