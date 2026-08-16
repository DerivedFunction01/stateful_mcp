import { describe, expect, test } from "bun:test";
import {
	decomposeScalarToChain,
	parseMultiUnitChain,
} from "../src/values/compound";
import { createCommonConversionRegistry } from "../src/values/conversion";

describe("Generic Multi-Unit Chained Measurements & Modulus Decomposition", () => {
	const registry = createCommonConversionRegistry();

	const unitAliases = {
		// Length
		"[ft_i]": ["ft", "feet", "foot", "'"],
		"[in_i]": ["in", "inches", "inch", '"'],
		"[mi_i]": ["mi", "miles", "mile"],
		"[yd_i]": ["yd", "yards", "yard"],
		m: ["meter", "meters", "m"],
		cm: ["centimeter", "centimeters", "cm"],
		// Mass
		"[lb_av]": ["lb", "lbs", "pound", "pounds"],
		"[oz_av]": ["oz", "ounces", "ounce"],
		kg: ["kg", "kilogram", "kilograms"],
		g: ["g", "gram", "grams"],
		// Time
		a: ["year", "years", "y", "yr", "yrs"],
		mo: ["month", "months", "mo"],
		d: ["day", "days", "d"],
		h: ["hour", "hours", "h", "hr", "hrs"],
		min: ["minute", "minutes", "min", "m"],
		s: ["second", "seconds", "sec", "s"],
	};

	test("parses two-part shorthand length chains (5'11\" and 5 ft 11 in)", () => {
		// Shorthand punctuation 5'11"
		const resPunct = parseMultiUnitChain("5'11\"", registry, {
			unitAliases,
			targetCanonical: "[in_i]",
		});
		expect(resPunct.diagnostics).toHaveLength(0);
		expect(resPunct.value).toMatchObject({
			kind: "quantity",
			magnitude: 71,
			unit: "[in_i]",
			dimension: "length",
		});
		expect(resPunct.value?.chain).toHaveLength(2);
		expect(resPunct.value?.chain[0]).toMatchObject({
			value: 5,
			unit: "[ft_i]",
		});
		expect(resPunct.value?.chain[1]).toMatchObject({
			value: 11,
			unit: "[in_i]",
		});

		// Word form 5 ft 11 in
		const resWords = parseMultiUnitChain("5 ft 11 in", registry, {
			unitAliases,
			targetCanonical: "[in_i]",
		});
		expect(resWords.diagnostics).toHaveLength(0);
		expect(resWords.value?.magnitude).toBe(71);

		// With conjunction "5 feet and 11 inches"
		const resConj = parseMultiUnitChain("5 feet and 11 inches", registry, {
			unitAliases,
			chainDelimiters: ["and", ","],
			targetCanonical: "[in_i]",
		});
		expect(resConj.diagnostics).toHaveLength(0);
		expect(resConj.value?.magnitude).toBe(71);
	});

	test("parses mass chains (7 lbs 6 oz)", () => {
		const resMass = parseMultiUnitChain("7 lbs 6 oz", registry, {
			unitAliases,
			targetCanonical: "[oz_av]",
		});
		expect(resMass.diagnostics).toHaveLength(0);
		// 7 lbs * 16 oz + 6 oz = 118 oz
		expect(resMass.value).toMatchObject({
			magnitude: 118,
			unit: "[oz_av]",
			dimension: "mass",
		});
	});

	test("parses N-ary multi-unit time chains across years, months, days, minutes, seconds", () => {
		const resTime = parseMultiUnitChain(
			"2 years 3 months 5 days 2 minutes 3 seconds",
			registry,
			{
				unitAliases,
				targetCanonical: "s",
			},
		);
		expect(resTime.diagnostics).toHaveLength(0);
		expect(resTime.value?.dimension).toBe("time");
		expect(resTime.value?.unit).toBe("s");
		expect(resTime.value?.chain).toHaveLength(5);
		expect(resTime.value?.magnitude).toBeGreaterThan(60000000);
	});

	test("supports configurable target canonical resolution (base, primary, discrete, or explicit)", () => {
		// Default base canonical (meters for length)
		const resBase = parseMultiUnitChain("5 ft 11 in", registry, {
			unitAliases,
			targetCanonical: "base",
		});
		expect(resBase.value?.unit).toBe("m");
		expect(resBase.value?.magnitude).toBeCloseTo(1.8034, 4);

		// Primary unit (feet)
		const resPrimary = parseMultiUnitChain("5 ft 11 in", registry, {
			unitAliases,
			targetCanonical: "primary",
		});
		expect(resPrimary.value?.unit).toBe("[ft_i]");
		expect(resPrimary.value?.magnitude).toBeCloseTo(5.91666, 4);

		// Discrete unit (inches)
		const resDiscrete = parseMultiUnitChain("5 ft 11 in", registry, {
			unitAliases,
			targetCanonical: "discrete",
		});
		expect(resDiscrete.value?.unit).toBe("[in_i]");
		expect(resDiscrete.value?.magnitude).toBe(71);

		// Explicit custom target (cm)
		const resExplicit = parseMultiUnitChain("5 ft 11 in", registry, {
			unitAliases,
			targetCanonical: "cm",
		});
		expect(resExplicit.value?.unit).toBe("cm");
		expect(resExplicit.value?.magnitude).toBeCloseTo(180.34, 2);
	});

	test("rejects conflicting physical dimensions in a single chain", () => {
		const resConflict = parseMultiUnitChain("2 hours and 5 kg", registry, {
			unitAliases,
			chainDelimiters: ["and"],
		});
		expect(resConflict.diagnostics).toEqual([
			expect.objectContaining({ code: "DIMENSION_MISMATCH" }),
		]);
	});

	test("decomposes scalar amounts into mixed unit chains via modulus reduction", () => {
		// Decompose 71 inches into [feet, inches]
		const chainLength = decomposeScalarToChain(
			71,
			"[in_i]",
			["[ft_i]", "[in_i]"],
			registry,
		);
		expect(chainLength).toEqual([
			expect.objectContaining({ unit: "[ft_i]", value: 5 }),
			expect.objectContaining({ unit: "[in_i]", value: 11 }),
		]);

		// Decompose 1,000,000 seconds into [days, hours, minutes, seconds]
		const chainTime = decomposeScalarToChain(
			1000000,
			"s",
			["d", "h", "min", "s"],
			registry,
		);
		// 1,000,000 s = 11 days (950,400s) + 13 hours (46,800s) + 46 minutes (2,760s) + 40 seconds
		expect(chainTime).toEqual([
			expect.objectContaining({ unit: "d", value: 11 }),
			expect.objectContaining({ unit: "h", value: 13 }),
			expect.objectContaining({ unit: "min", value: 46 }),
			expect.objectContaining({ unit: "s", value: 40 }),
		]);

		// Out-of-order target units are automatically sorted by magnitude
		const chainUnordered = decomposeScalarToChain(
			71,
			"[in_i]",
			["[in_i]", "[ft_i]"], // passed in reverse
			registry,
		);
		expect(chainUnordered).toEqual([
			expect.objectContaining({ unit: "[ft_i]", value: 5 }),
			expect.objectContaining({ unit: "[in_i]", value: 11 }),
		]);
	});
});
