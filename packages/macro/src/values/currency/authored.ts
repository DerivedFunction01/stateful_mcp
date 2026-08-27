import { createFundamentalFromAuthoredFormat } from "../fundamentals";
import { buildNumericPatternString } from "../numeric";
import type { RecipeOutputBuilder, ValueRecipe } from "../recipes";
import { buildMarkerPattern, slotValue } from "../recipes/shared";
import {
	CURRENCY_TOKENS,
	type CurrencyToken,
	parseFormatTemplate,
	type ValueFormatConfig,
} from "../token-spec";
import { STANDARD_CURRENCY_CATALOG } from "./catalog";
import type { CurrencyFormatConfig, CurrencyGrammarResult } from "./types";
import { toSubunits } from "./value";

export interface AuthoredCurrencyTemplateCompilation {
	readonly fundamentals: readonly ReturnType<
		typeof createFundamentalFromAuthoredFormat
	>[];
	readonly recipes: readonly ValueRecipe[];
}

function currencyMarkerValues(config: CurrencyFormatConfig): string[] {
	const values: string[] = [];
	for (const definition of config.definitions ?? STANDARD_CURRENCY_CATALOG) {
		values.push(definition.code, ...(definition.symbols ?? []));
	}
	for (const [code, aliases] of Object.entries(config.currencies ?? {}))
		values.push(code, ...aliases);
	return values;
}

export function compileAuthoredCurrencyTemplates(
	config: CurrencyFormatConfig,
): AuthoredCurrencyTemplateCompilation {
	const fundamentals: ReturnType<typeof createFundamentalFromAuthoredFormat>[] =
		[];
	const recipes: ValueRecipe[] = [];
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format: ValueFormatConfig<CurrencyToken> =
			typeof template === "string"
				? parseFormatTemplate(template, CURRENCY_TOKENS)
				: template;
		if (format.tokens.length === 0) continue;
		const id = `currency.template.${format.id ?? index}`;
		const tokenSpecs: Record<CurrencyToken, { pattern: string }> = {
			SYM: { pattern: buildMarkerPattern(currencyMarkerValues(config)) },
			CODE: { pattern: buildMarkerPattern(currencyMarkerValues(config)) },
			AMOUNT: {
				pattern: buildNumericPatternString({
					...(config.numericConfig ?? {}),
					...config,
				}),
			},
			SUBUNITS: {
				pattern: buildNumericPatternString({
					...(config.numericConfig ?? {}),
					...config,
				}),
			},
			OP: { pattern: ".+?" },
		};
		fundamentals.push(
			createFundamentalFromAuthoredFormat(id, format, tokenSpecs),
		);
		recipes.push({
			id,
			root: {
				kind: "fundamental",
				groupId: id,
				children: format.tokens.map((token) => ({
					kind: "terminal" as const,
					consumerId:
						token === "AMOUNT" || token === "SUBUNITS"
							? "currency-amount"
							: token === "SYM" || token === "CODE"
								? "currency-marker"
								: "operator",
				})),
			},
			outputBuilderId: id,
		});
	}
	return { fundamentals, recipes };
}

export function createCurrencyOutputBuilders(
	config: CurrencyFormatConfig = {},
): Readonly<Record<string, RecipeOutputBuilder>> {
	const builders: Record<string, RecipeOutputBuilder> = {};
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format: ValueFormatConfig<CurrencyToken> =
			typeof template === "string"
				? parseFormatTemplate(template, CURRENCY_TOKENS)
				: template;
		const id = `currency.template.${format.id ?? index}`;
		builders[id] = ({ evaluation, input, policy }) => {
			const marker =
				slotValue(evaluation, "SYM") ?? slotValue(evaluation, "CODE");
			const amount = slotValue(evaluation, "AMOUNT");
			const subunits = slotValue(evaluation, "SUBUNITS");
			if (
				typeof marker !== "object" ||
				marker === null ||
				(typeof amount !== "number" && typeof subunits !== "number")
			)
				return { valid: false };
			const markerValue = marker as { code?: unknown; symbol?: unknown };
			const currency =
				typeof markerValue.code === "string" ? markerValue.code : undefined;
			if (!currency) return { valid: false };
			const currencyPolicy = policy?.currencyConsumerPolicy;
			if (
				currencyPolicy?.allowedCurrencies &&
				!currencyPolicy.allowedCurrencies.includes(currency)
			)
				return { valid: false };
			const decimals =
				(config.definitions ?? STANDARD_CURRENCY_CATALOG).find(
					(item) => item.code === currency,
				)?.decimals ?? 2;
			const valueAmount =
				typeof amount === "number"
					? amount
					: (subunits as number) / 10 ** decimals;
			if (currencyPolicy?.allowNegative === false && valueAmount < 0)
				return { valid: false };
			const value: CurrencyGrammarResult = {
				amount: valueAmount,
				currency,
				subunits: toSubunits(valueAmount, decimals),
				symbol:
					typeof markerValue.symbol === "string"
						? markerValue.symbol
						: currency,
				rawText: input.trim(),
			};
			return { valid: true, value, displayValue: input.trim() };
		};
	}
	return builders;
}
