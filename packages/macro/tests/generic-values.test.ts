import { describe, expect, test } from "bun:test";
import { buildDatePatternString } from "../src/values/date-time";
import { buildNumericPatternString } from "../src/values/numeric";
import { parseQuantity } from "../src/values/quantity";
import { createMeasurementValueFromQuantity } from "../src/values/measurement";

describe("topic-agnostic value primitives", () => {
	test("builds configured numeric patterns", () => {
		const pattern = buildNumericPatternString({ decimalDigits: 2, allowNegative: false, exact: true });
		expect(new RegExp(pattern).test("12.50")).toBe(true);
		expect(new RegExp(pattern).test("-12.50")).toBe(false);
	});

	test("parses configured opaque quantities", () => {
		const result = parseQuantity("1.5 canonical", {
			unitAliases: { canonical: "unit-x" },
			rangeDelimiters: [" to "],
		}, { allowRange: true, allowOperator: false, statistics: "reject", allowDataPointCount: false });
		expect(result.value).toMatchObject({ lower: 1.5, unit: "unit-x" });
		expect(createMeasurementValueFromQuantity(result.value!).range).toBeUndefined();
	});

	test("builds date patterns from caller supplied tokens", () => {
		const result = buildDatePatternString(["YYYY", "MM", "DD"], ["-", "-"], { exact: true });
		expect(new RegExp(result.pattern).test("2026-08-13")).toBe(true);
	});
});
