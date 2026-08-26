import type { CurrencyGrammarResult } from "../currency";
import type { FundamentalGroup } from "../fundamentals";
import { createFundamentalFromAuthoredFormat } from "../fundamentals";
import type { QuantityGrammarResult } from "../quantity";
import type {
	RecipeEvaluation,
	RecipeOutputBuilder,
	ValueRecipe,
} from "../recipes";
import { escapeRegex } from "../regex";
import {
	parseFormatTemplate,
	RATE_TOKENS,
	type RateToken,
	type ValueFormatConfig,
} from "../token-spec";
import type { CompoundRateConfig, CompoundRateValue } from "./types";

export interface AuthoredRateTemplateCompilation {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
}

function slotValue(evaluation: RecipeEvaluation, name: string): unknown {
	if (evaluation.kind !== "fundamental") return undefined;
	const slot = Object.keys(evaluation.slots).find((id) =>
		id.startsWith(`${name}_`),
	);
	return slot && evaluation.slots[slot]?.kind === "terminal"
		? evaluation.slots[slot].value
		: undefined;
}

function slotValues(evaluation: RecipeEvaluation, name: string): unknown[] {
	if (evaluation.kind !== "fundamental") return [];
	return Object.keys(evaluation.slots)
		.filter((id) => id.startsWith(`${name}_`))
		.map((id) =>
			evaluation.slots[id]?.kind === "terminal"
				? evaluation.slots[id].value
				: undefined,
		);
}

function aliases(values: readonly string[] | undefined): string {
	return `(?:${(values ?? []).map(escapeRegex).join("|")})`;
}

export function compileAuthoredRateTemplates(
	config: CompoundRateConfig,
): AuthoredRateTemplateCompilation {
	const fundamentals: FundamentalGroup[] = [];
	const recipes: ValueRecipe[] = [];
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format: ValueFormatConfig<RateToken> =
			typeof template === "string"
				? parseFormatTemplate(template, RATE_TOKENS)
				: template;
		if (format.tokens.length === 0) continue;
		const id = `rate.template.${format.id ?? index}`;
		const tokenSpecs: Record<RateToken, { pattern: string }> = {
			NUMERATOR: { pattern: ".+?" },
			RATE_DELIM: { pattern: aliases(config.rateDelimiters) },
			DENOMINATOR: { pattern: ".+?" },
			DIVISOR_MAG: { pattern: "[\\p{N}]+(?:[.,][\\p{N}]+)?" },
		};
		fundamentals.push(
			createFundamentalFromAuthoredFormat(id, format, tokenSpecs),
		);
		for (const numeratorType of ["quantity", "currency"] as const) {
			const recipeId = `${id}.${numeratorType}`;
			recipes.push({
				id: recipeId,
				root: {
					kind: "fundamental",
					groupId: id,
					children: format.tokens.map((token) => ({
						kind: "terminal" as const,
						consumerId:
							token === "NUMERATOR"
								? numeratorType
								: token === "RATE_DELIM"
									? "rate-delimiter"
									: token === "DIVISOR_MAG"
										? "currency-amount"
										: "rate-denominator",
					})),
				},
				outputBuilderId: recipeId,
			});
		}
	}
	return { fundamentals, recipes };
}

export function createRateOutputBuilders(
	config: CompoundRateConfig = {},
): Readonly<Record<string, RecipeOutputBuilder>> {
	const builders: Record<string, RecipeOutputBuilder> = {};
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format: ValueFormatConfig<RateToken> =
			typeof template === "string"
				? parseFormatTemplate(template, RATE_TOKENS)
				: template;
		const id = `rate.template.${format.id ?? index}`;
		for (const numeratorType of ["quantity", "currency"] as const) {
			builders[`${id}.${numeratorType}`] = ({ evaluation, input, policy }) => {
				const numerator = slotValue(evaluation, "NUMERATOR");
				const denominatorValues = [
					...slotValues(evaluation, "DENOMINATOR"),
					...slotValues(evaluation, "DIVISOR_MAG"),
				].filter((value): value is QuantityGrammarResult =>
					Boolean(
						value && typeof value === "object" && "primaryQuantity" in value,
					),
				);
				if (!numerator || denominatorValues.length === 0)
					return { valid: false };
				const numeratorValue = numerator as
					| QuantityGrammarResult
					| CurrencyGrammarResult;
				if (
					numeratorType === "quantity" &&
					!("primaryQuantity" in numeratorValue)
				)
					return { valid: false };
				if (numeratorType === "currency" && "primaryQuantity" in numeratorValue)
					return { valid: false };
				const value: CompoundRateValue = {
					kind: "rate",
					numerator:
						"primaryQuantity" in numeratorValue
							? { type: "quantity", quantity: numeratorValue.primaryQuantity }
							: { type: "currency", currency: numeratorValue },
					denominators: denominatorValues.map((item) => ({
						unit: item.primaryQuantity.unit,
						magnitude: item.primaryQuantity.magnitude,
						quantity: item.primaryQuantity,
						rawText: item.rawText,
					})),
					rawText: input.trim(),
				};
				const max = policy?.rateConsumerPolicy?.maxDenominators;
				return max !== undefined && value.denominators.length > max
					? { valid: false }
					: { valid: true, value, displayValue: input.trim() };
			};
		}
	}
	return builders;
}
