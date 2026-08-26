import { describe, expect, test } from "bun:test";
import {
	normalizeUnicodeDigits,
	parseOrdinalValue,
} from "../src/values/localization";
import { formatNumericValue, parseNumericValue } from "../src/values/numeric";

describe("Universal Numeric Engine (numeric.ts)", () => {
	describe("explicit numeric capabilities", () => {
		test("keeps ordinal forms explicit and separate from cardinals", () => {
			const config = {
				atoms: { "1": "one", "2": "two" },
				scales: [],
				ordinals: {
					ordinalAtoms: { "1": "first", "2": ["second", "2nd"] },
					suffix: "th",
					prefix: "第",
				},
			} as const;
			expect(parseOrdinalValue("first", config)?.value).toBe(1);
			expect(parseOrdinalValue("second", config)?.value).toBe(2);
			expect(parseOrdinalValue("2nd", config)?.value).toBe(2);
			expect(parseOrdinalValue("第3", config)?.value).toBe(3);
			expect(parseOrdinalValue("3th", config)?.value).toBe(3);
			expect(parseOrdinalValue("one", config)).toBeUndefined();
		});
		test("accepts only configured forms", () => {
			expect(
				parseNumericValue("3", { allowedForms: ["integer"] }).parsed?.value,
			).toBe(3);
			expect(
				parseNumericValue("3.5", { allowedForms: ["integer"] }).parsed,
			).toBeUndefined();
			expect(
				parseNumericValue("3/5", { allowedForms: ["fraction"] }).parsed?.value,
			).toBe(0.6);
			expect(
				parseNumericValue("1 1/2", { allowedForms: ["fraction"] }).parsed,
			).toBeUndefined();
			expect(
				parseNumericValue("1 1/2", { allowedForms: ["mixed_fraction"] }).parsed
					?.value,
			).toBe(1.5);
		});

		test("validates fraction denominator and improper policy before decimal coercion", () => {
			expect(
				parseNumericValue("3/5", {
					allowedForms: ["fraction"],
					fractionConstraints: { denominator: { exact: 10 } },
				}).parsed,
			).toBeUndefined();
			expect(
				parseNumericValue("5/3", {
					allowedForms: ["fraction"],
					fractionConstraints: { allowImproper: false },
				}).parsed,
			).toBeUndefined();
		});
	});
	describe("1. Standard Integers & Decimals", () => {
		test("parses positive and negative integers", () => {
			const res1 = parseNumericValue("50");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(50);
			expect(res1.parsed?.kind).toBe("integer");
			expect(res1.parsed?.sign).toBe(1);

			const res2 = parseNumericValue("-120");
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(-120);
			expect(res2.parsed?.kind).toBe("integer");
			expect(res2.parsed?.sign).toBe(-1);
		});

		test("parses standard and localized decimals", () => {
			const res1 = parseNumericValue("12.50");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(12.5);
			expect(res1.parsed?.kind).toBe("decimal");

			const res2 = parseNumericValue("1.250,75", {
				decimalPoint: ",",
				thousandsSeparator: ".",
			});
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(1250.75);
			expect(res2.parsed?.kind).toBe("decimal");
		});

		test("parses accounting parentheses as negative", () => {
			const res = parseNumericValue("(50.25)");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.parsed?.value).toBe(-50.25);
			expect(res.parsed?.sign).toBe(-1);
		});
	});

	describe("2. Fractions & Mixed Fractions", () => {
		test("parses text fractions (e.g. 3/4, 1/2)", () => {
			const res1 = parseNumericValue("3/4");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(0.75);
			expect(res1.parsed?.kind).toBe("fraction");
			expect(res1.parsed?.fraction).toEqual({ numerator: 3, denominator: 4 });

			const res2 = parseNumericValue("-1/2");
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(-0.5);
			expect(res2.parsed?.kind).toBe("fraction");
		});

		test("parses Unicode vulgar fractions (e.g. ½, ¾, ⅓)", () => {
			const res1 = parseNumericValue("¾");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(0.75);
			expect(res1.parsed?.kind).toBe("fraction");

			const res2 = parseNumericValue("½");
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(0.5);
			expect(res2.parsed?.kind).toBe("fraction");
		});

		test("parses mixed fractions (e.g. 1 1/2, 3 3/4, 2 ½)", () => {
			const res1 = parseNumericValue("1 1/2");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(1.5);
			expect(res1.parsed?.kind).toBe("mixed_fraction");
			expect(res1.parsed?.integerPart).toBe(1);
			expect(res1.parsed?.fraction).toEqual({ numerator: 3, denominator: 2 });

			const res2 = parseNumericValue("3 3/4");
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(3.75);
			expect(res2.parsed?.kind).toBe("mixed_fraction");

			const res3 = parseNumericValue("2 ½");
			expect(res3.diagnostics).toHaveLength(0);
			expect(res3.parsed?.value).toBe(2.5);
			expect(res3.parsed?.kind).toBe("mixed_fraction");
		});

		test("rejects division by zero", () => {
			const res = parseNumericValue("5/0");
			expect(res.parsed).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("division_by_zero");
		});
	});

	describe("3. Scientific Notation", () => {
		test("parses exponential / scientific notation", () => {
			const res1 = parseNumericValue("1.5e-3");
			expect(res1.diagnostics).toHaveLength(0);
			expect(res1.parsed?.value).toBe(0.0015);
			expect(res1.parsed?.kind).toBe("scientific");
			expect(res1.parsed?.exponent).toBe(-3);

			const res2 = parseNumericValue("2.4E6");
			expect(res2.diagnostics).toHaveLength(0);
			expect(res2.parsed?.value).toBe(2400000);
			expect(res2.parsed?.kind).toBe("scientific");
			expect(res2.parsed?.exponent).toBe(6);
		});
	});

	describe("4. Multi-Script Unicode Digits", () => {
		test("normalizes Arabic-Indic, Devanagari, and Fullwidth digits", () => {
			expect(normalizeUnicodeDigits("٥٠")).toBe("50");
			expect(normalizeUnicodeDigits("५०")).toBe("50");
			expect(normalizeUnicodeDigits("５０")).toBe("50");

			const resArabic = parseNumericValue("٥٠");
			expect(resArabic.parsed?.value).toBe(50);

			const resDevanagari = parseNumericValue("५०.२५");
			expect(resDevanagari.parsed?.value).toBe(50.25);
		});
	});

	describe("5. Consumer Policy Enforcement & Bounds", () => {
		test("enforces numeric bounds [min, max]", () => {
			const resValid = parseNumericValue("50", {
				bounds: { min: 0, max: 100 },
			});
			expect(resValid.diagnostics).toHaveLength(0);
			expect(resValid.parsed?.value).toBe(50);

			const resExceeded = parseNumericValue("150", {
				bounds: { min: 0, max: 100 },
			});
			expect(resExceeded.parsed).toBeUndefined();
			expect(resExceeded.diagnostics[0]?.code).toBe("bounds_exceeded");
		});

		test("rejects negative numbers when allowNegative is false", () => {
			const res = parseNumericValue("-50", { allowNegative: false });
			expect(res.parsed).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("negative_not_allowed");
		});

		test("rejects fractions when allowFractions is false", () => {
			const res = parseNumericValue("3/4", { allowFractions: false });
			expect(res.parsed).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("fractions_not_allowed");
		});
	});

	describe("6. formatNumericValue", () => {
		test("formats numbers with custom separators and precision", () => {
			expect(formatNumericValue(1250.5, { thousandsSeparator: "," })).toBe(
				"1,250.5",
			);
			expect(
				formatNumericValue(1250.75, {
					thousandsSeparator: ".",
					decimalPoint: ",",
				}),
			).toBe("1.250,75");
			expect(
				formatNumericValue(-50.25, {
					negativeStyle: "parens",
				}),
			).toBe("(50.25)");
		});
	});
});
