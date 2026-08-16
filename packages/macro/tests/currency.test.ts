import { describe, expect, test } from "bun:test";
import type { CurrencyFormatConfig } from "../src/values/currency";
import {
	buildCurrencyPatternString,
	createCurrencyValue,
	parseCurrency,
} from "../src/values/currency";

describe("First-class Currency Value System", () => {
	const usProfile: CurrencyFormatConfig = {
		defaultCurrency: "USD",
		currencies: {
			USD: ["$", "US$", "USD", "dollar", "dollars", "buck", "bucks"],
			EUR: ["€", "EUR", "euro", "euros"],
			GBP: ["£", "GBP", "pound", "pounds", "quid"],
			JPY: ["¥", "JPY", "yen", "円"],
		},
		definitions: [
			{
				code: "USD",
				decimals: 2,
				symbols: ["$", "US$"],
				denominations: [
					{ id: "dollar", factor: 1.0, aliases: ["dollar", "dollars", "USD"] },
					{ id: "quarter", factor: 0.25, aliases: ["quarter", "quarters"] },
					{ id: "dime", factor: 0.1, aliases: ["dime", "dimes"] },
					{ id: "nickel", factor: 0.05, aliases: ["nickel", "nickels"] },
					{
						id: "cent",
						factor: 0.01,
						aliases: ["cent", "cents", "penny", "pennies", "¢"],
					},
				],
			},
			{
				code: "EUR",
				decimals: 2,
				symbols: ["€"],
				denominations: [
					{ id: "euro", factor: 1.0, aliases: ["euro", "euros", "EUR"] },
					{ id: "cent", factor: 0.01, aliases: ["cent", "cents"] },
				],
			},
			{
				code: "GBP",
				decimals: 2,
				symbols: ["£"],
				denominations: [
					{
						id: "pound",
						factor: 1.0,
						aliases: ["pound", "pounds", "quid", "GBP"],
					},
					{ id: "penny", factor: 0.01, aliases: ["penny", "pence", "p"] },
				],
			},
			{
				code: "JPY",
				decimals: 0,
				symbols: ["¥"],
				denominations: [
					{ id: "yen", factor: 1.0, aliases: ["yen", "JPY", "円"] },
				],
			},
		],
		chainDelimiters: ["and", ","],
		decimalSeparator: ".",
		thousandsSeparator: ",",
	};

	test("parses prefix currency symbols and formats correctly", () => {
		const resUsd = parseCurrency("$450.00", usProfile);
		expect(resUsd.diagnostics).toHaveLength(0);
		expect(resUsd.value).toMatchObject({
			amount: 450,
			currency: "USD",
			subunits: 45000,
			symbol: "$",
		});

		const resFormatted = parseCurrency("US$ 1,250.50", usProfile);
		expect(resFormatted.diagnostics).toHaveLength(0);
		expect(resFormatted.value).toMatchObject({
			amount: 1250.5,
			currency: "USD",
			subunits: 125050,
			symbol: "US$",
		});

		const resJpy = parseCurrency("¥1000", usProfile);
		expect(resJpy.diagnostics).toHaveLength(0);
		expect(resJpy.value).toMatchObject({
			amount: 1000,
			currency: "JPY",
			subunits: 1000, // JPY has 0 decimals
			symbol: "¥",
		});
	});

	test("parses suffix currency symbols and European formats", () => {
		const frProfile: CurrencyFormatConfig = {
			defaultCurrency: "EUR",
			currencies: {
				EUR: ["€", "EUR", "euros", "euro"],
			},
			definitions: [
				{
					code: "EUR",
					decimals: 2,
					symbols: ["€"],
					denominations: [
						{ id: "euro", factor: 1.0, aliases: ["euro", "euros"] },
						{ id: "centime", factor: 0.01, aliases: ["centime", "centimes"] },
					],
				},
			],
			chainDelimiters: ["et", ","],
			decimalSeparator: ",",
			thousandsSeparator: " ",
		};

		const resEur = parseCurrency("1 250,50 €", frProfile);
		expect(resEur.diagnostics).toHaveLength(0);
		expect(resEur.value).toMatchObject({
			amount: 1250.5,
			currency: "EUR",
			subunits: 125050,
			symbol: "€",
		});

		// Multilingual denomination chain in French
		const resChainFr = parseCurrency("10 euros et 50 centimes", frProfile);
		expect(resChainFr.diagnostics).toHaveLength(0);
		expect(resChainFr.value).toMatchObject({
			amount: 10.5,
			currency: "EUR",
			subunits: 1050,
		});
	});

	test("parses accounting parentheses and negative notations", () => {
		const resParens = parseCurrency("($50.00)", usProfile);
		expect(resParens.diagnostics).toHaveLength(0);
		expect(resParens.value).toMatchObject({
			amount: -50,
			currency: "USD",
			subunits: -5000,
		});

		const resMinus = parseCurrency("-$1,000", usProfile);
		expect(resMinus.diagnostics).toHaveLength(0);
		expect(resMinus.value).toMatchObject({
			amount: -1000,
			currency: "USD",
			subunits: -100000,
		});
	});

	test("parses multi-denomination coin chains", () => {
		const resChain = parseCurrency(
			"3 dollars 2 quarters 1 dime and 3 pennies",
			usProfile,
		);
		expect(resChain.diagnostics).toHaveLength(0);
		expect(resChain.value).toMatchObject({
			amount: 3.63,
			currency: "USD",
			subunits: 363,
		});
	});

	test("enforces consumer policies (allowlists and negative restrictions)", () => {
		// Allowed currencies policy
		const policy = {
			allowedCurrencies: ["USD", "EUR"],
			allowNegative: false,
		};

		const resAllowed = parseCurrency("$100", usProfile, policy);
		expect(resAllowed.diagnostics).toHaveLength(0);
		expect(resAllowed.value?.currency).toBe("USD");

		const resRejectedCurrency = parseCurrency("£100", usProfile, policy);
		expect(resRejectedCurrency.diagnostics).toEqual([
			expect.objectContaining({ code: "CURRENCY_NOT_ALLOWED" }),
		]);

		const resRejectedNegative = parseCurrency("-$50", usProfile, policy);
		expect(resRejectedNegative.diagnostics).toEqual([
			expect.objectContaining({ code: "NEGATIVE_NOT_ALLOWED" }),
		]);
	});

	test("buildCurrencyPatternString handles dynamic symbols without assumptions", () => {
		const emptyConfig: CurrencyFormatConfig = {};
		const emptyPattern = buildCurrencyPatternString(emptyConfig);
		expect(emptyPattern.pattern).toBe("");

		const configWithSymbols: CurrencyFormatConfig = {
			currencies: { USD: ["$", "US$"], EUR: ["€"] },
		};
		const compiled = buildCurrencyPatternString(configWithSymbols);
		expect(compiled.pattern).toContain("US\\$");
		expect(compiled.pattern).toContain("\\$");
		expect(compiled.pattern).toContain("€");
		expect(new RegExp(compiled.pattern, "u").test("US$ 100")).toBe(true);
		expect(new RegExp(compiled.pattern, "u").test("€50.25")).toBe(true);
	});

	test("creates structured CurrencyValue objects with precision formatting", () => {
		const val = createCurrencyValue(1250.5, "USD", { symbol: "$" });
		expect(val).toMatchObject({
			kind: "currency",
			amount: 1250.5,
			currency: "USD",
			subunits: 125050,
			symbol: "$",
			formatted: "$1250.50",
		});
	});
});
