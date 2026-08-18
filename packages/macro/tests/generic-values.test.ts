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
				statisticsPolicy: { policy: "reject_all_statistics" },
				allowDataPointCount: false,
			},
		);
		expect(result.value?.primaryQuantity).toMatchObject({
			magnitude: 1.5,
			unit: "unit-x",
		});
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
				statisticsPolicy: { policy: "reject_all_statistics" },
				allowDataPointCount: false,
			},
		);
		expect(result2.value?.primaryQuantity).toMatchObject({
			magnitude: 2.5,
			unit: "kg",
		});
	});

	test("builds date patterns from caller supplied tokens", () => {
		const result = buildDatePatternString(["YYYY", "MM", "DD"], ["-", "-"], {
			exact: true,
		});
		expect(new RegExp(result.pattern).test("2026-08-13")).toBe(true);
	});

	test("resolves two-digit years with default and configurable century pivots", () => {
		expect(resolveTwoDigitYear(26)).toBe(2026);
		expect(resolveTwoDigitYear(85)).toBe(1985);
		expect(
			resolveTwoDigitYear(25, {
				pivotYear: 20,
			}),
		).toBe(1925);
		expect(
			resolveTwoDigitYear(25, {
				pivotYear: 30,
			}),
		).toBe(2025);
	});

	test("parses operator and statistical aliases with multilingual array mappings", () => {
		const config = {
			unitAliases: { kg: ["kilograms", "kg"] },
			rangeDelimiters: ["-"],
			operatorConfig: {
				operators: {
					greater_equal: [">=", "at least", "au moins", "至少"],
					less: ["<", "less than", "moins de", "小于"],
				},
			},
			statisticalConfig: {
				qualifiers: {
					mean: ["mean", "average", "avg", "moyenne", "平均"],
				},
			},
		};
		const policy = {
			allowRange: true,
			allowOperator: true,
			statisticsPolicy: { policy: "accept_all" as const },
			allowDataPointCount: false,
		};

		const resultEn = parseQuantity("at least 10 kg", config, policy);
		expect(resultEn.value).toMatchObject({
			operator: { operator: "greater_equal" },
			primaryQuantity: { magnitude: 10, unit: "kg" },
		});

		const resultFr = parseQuantity("au moins 15 kg", config, policy);
		expect(resultFr.value).toMatchObject({
			operator: { operator: "greater_equal" },
			primaryQuantity: { magnitude: 15, unit: "kg" },
		});

		const resultZh = parseQuantity("至少 20 kg", config, policy);
		expect(resultZh.value).toMatchObject({
			operator: { operator: "greater_equal" },
			primaryQuantity: { magnitude: 20, unit: "kg" },
		});

		const resultStat = parseQuantity("average 25 kg", config, policy);
		expect(resultStat.value).toMatchObject({
			statisticalQualifier: { type: "mean" },
			primaryQuantity: { magnitude: 25, unit: "kg" },
		});

		const resultStatZh = parseQuantity("平均 30 kg", config, policy);
		expect(resultStatZh.value).toMatchObject({
			statisticalQualifier: { type: "mean" },
			primaryQuantity: { magnitude: 30, unit: "kg" },
		});
	});
});
