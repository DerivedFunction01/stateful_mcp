import { describe, expect, test } from "bun:test";
import {
	compileDomainConfig,
	createBuiltinTerminals,
	parseConfiguredValue,
} from "../../src";
import {
	compileAuthoredCurrencyTemplates,
	createCurrencyOutputBuilders,
} from "../../src/values/currency";
import {
	compileAuthoredRateTemplates,
	createRateOutputBuilders,
} from "../../src/values/rates";

describe("authored currency and rate values", () => {
	test("compileDomainConfig registers authored currency and rate recipes", () => {
		const grammar = compileDomainConfig({
			values: {
				currency: {
					templates: ["CODE AMOUNT"],
					definitions: [{ code: "USD", decimals: 2, symbols: ["$"] }],
				},
				rates: {
					templates: ["NUMERATOR RATE_DELIM DENOMINATOR"],
					rateDelimiters: ["per"],
				},
			},
		});

		expect(grammar.recipes?.recipes.map((recipe) => recipe.id)).toEqual([
			"currency.template.0",
			"rate.template.0.quantity",
			"rate.template.0.currency",
		]);
		expect(
			grammar.recipes?.recipes.some((recipe) => recipe.id === "numeric"),
		).toBe(false);
	});

	test("builds configured currency precision and subunits from an authored recipe", () => {
		const currency = {
			templates: ["CODE AMOUNT"],
			definitions: [{ code: "USD", decimals: 2, symbols: ["$"] }],
		} as const;
		const authored = compileAuthoredCurrencyTemplates(currency);
		const grammar = compileDomainConfig({
			values: { currency },
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = parseConfiguredValue(
			"USD 12.50",
			grammar,
			{ enabledRecipes: ["currency.template.0"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: createCurrencyOutputBuilders(currency),
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			amount: 12.5,
			currency: "USD",
			subunits: 1250,
			rawText: "USD 12.50",
		});
		const rejected = parseConfiguredValue(
			"USD -12.50",
			grammar,
			{
				enabledRecipes: ["currency.template.0"],
				currencyConsumerPolicy: { allowNegative: false },
			},
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: createCurrencyOutputBuilders(currency),
			},
		);
		expect(rejected.selected).toBeUndefined();
	});

	test("builds an authored rate with chained denominators", () => {
		const rates = {
			templates: ["NUMERATOR RATE_DELIM DENOMINATOR RATE_DELIM DENOMINATOR"],
			rateDelimiters: ["per"],
		} as const;
		const authored = compileAuthoredRateTemplates(rates);
		const grammar = compileDomainConfig({
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = parseConfiguredValue(
			"10 per kg per day",
			grammar,
			{ enabledRecipes: ["rate.template.0.quantity"] },
			{
				terminals: {
					quantity: (_id, input) => ({
						valid: true,
						value: {
							primaryQuantity: {
								magnitude: Number(input),
								unit: "unit",
								rawText: input,
							},
							rawText: input,
						},
					}),
					"rate-delimiter": () => ({ valid: true, value: "per" }),
					"rate-denominator": (_id, input) => ({
						valid: true,
						value: {
							primaryQuantity: { magnitude: 1, unit: input, rawText: input },
							rawText: input,
						},
					}),
				},
				outputBuilders: createRateOutputBuilders(rates),
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			kind: "rate",
			denominators: [{ unit: "kg" }, { unit: "day" }],
		});
	});
});
