import { describe, expect, test } from "bun:test";
import {
	buildDatePatternString,
	resolveTwoDigitYear,
} from "../src/values/date-time";
import { createMeasurementValueFromQuantity } from "../src/values/measurement";
import { buildNumericPatternString } from "../src/values/numeric";
import { parseQuantity } from "../src/values/quantity";

describe("topic-agnostic value primitives", () => {
	test("builds configured numeric patterns", () => {
		const pattern = buildNumericPatternString({
			decimalDigits: 2,
			allowNegative: false,
			exact: true,
		});
		expect(new RegExp(pattern).test("12.50")).toBe(true);
		expect(new RegExp(pattern).test("-12.50")).toBe(false);
	});

	test("parses configured opaque quantities", () => {
		const result = parseQuantity(
			"1.5 canonical",
			{
				unitAliases: { "unit-x": ["canonical", "unit-x"] },
				rangeDelimiters: [" to "],
			},
			{
				allowRange: true,
				allowOperator: false,
				statistics: "reject",
				allowDataPointCount: false,
			},
		);
		expect(result.value).toMatchObject({ lower: 1.5, unit: "unit-x" });
		expect(
			createMeasurementValueFromQuantity(result.value!).range,
		).toBeUndefined();

		const result2 = parseQuantity(
			"2.5 kg",
			{
				unitAliases: { kg: ["kilogram", "kilograms", "kg"] },
				rangeDelimiters: ["-"],
			},
			{
				allowRange: false,
				allowOperator: false,
				statistics: "reject",
				allowDataPointCount: false,
			},
		);
		expect(result2.value).toMatchObject({ lower: 2.5, unit: "kg" });
	});

	test("builds date patterns from caller supplied tokens", () => {
		const result = buildDatePatternString(["YYYY", "MM", "DD"], ["-", "-"], {
			exact: true,
		});
		expect(new RegExp(result.pattern).test("2026-08-13")).toBe(true);
	});

	test("resolves two-digit years with default and configurable century pivots", () => {
		// Default pivot = 50 (0..50 -> 2000..2050, 51..99 -> 1951..1999)
		expect(resolveTwoDigitYear(26)).toBe(2026);
		expect(resolveTwoDigitYear("26")).toBe(2026);
		expect(resolveTwoDigitYear(50)).toBe(2050);
		expect(resolveTwoDigitYear(51)).toBe(1951);
		expect(resolveTwoDigitYear(99)).toBe(1999);
		expect(resolveTwoDigitYear(2024)).toBe(2024); // 4-digit unaffected

		// Custom pivot = 30 (0..30 -> 2000..2030, 31..99 -> 1931..1999)
		expect(resolveTwoDigitYear(29, { pivotYear: 30 })).toBe(2029);
		expect(resolveTwoDigitYear(30, { pivotYear: 30 })).toBe(2030);
		expect(resolveTwoDigitYear(31, { pivotYear: 30 })).toBe(1931);

		// Custom centuries (e.g. 2100 / 2000)
		expect(
			resolveTwoDigitYear(15, {
				pivotYear: 20,
				currentCentury: 2100,
				previousCentury: 2000,
			}),
		).toBe(2115);
		expect(
			resolveTwoDigitYear(25, {
				pivotYear: 20,
				currentCentury: 2100,
				previousCentury: 2000,
			}),
		).toBe(2025);
	});

	test("parses operator and statistical aliases with multilingual array mappings", () => {
		const config = {
			unitAliases: { kg: ["kilograms", "kg"] },
			rangeDelimiters: ["-"],
			operatorAliases: {
				">=": [">=", "at least", "au moins", "至少"],
				"<": ["<", "less than", "moins de", "小于"],
			},
			statisticalAliases: {
				mean: ["mean", "average", "avg", "moyenne", "平均"],
			},
		};
		const policy = {
			allowRange: true,
			allowOperator: true,
			statistics: "accept" as const,
			allowDataPointCount: false,
		};

		const resultEn = parseQuantity("at least 10 kg", config, policy);
		expect(resultEn.value).toMatchObject({
			operator: ">=",
			lower: 10,
			unit: "kg",
		});

		const resultFr = parseQuantity("au moins 15 kg", config, policy);
		expect(resultFr.value).toMatchObject({
			operator: ">=",
			lower: 15,
			unit: "kg",
		});

		const resultZh = parseQuantity("至少 20 kg", config, policy);
		expect(resultZh.value).toMatchObject({
			operator: ">=",
			lower: 20,
			unit: "kg",
		});

		const resultStat = parseQuantity("average 25 kg", config, policy);
		expect(resultStat.value).toMatchObject({
			statisticalType: "mean",
			lower: 25,
			unit: "kg",
		});

		const resultStatZh = parseQuantity("平均 30 kg", config, policy);
		expect(resultStatZh.value).toMatchObject({
			statisticalType: "mean",
			lower: 30,
			unit: "kg",
		});
	});
});
