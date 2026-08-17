import { describe, expect, test } from "bun:test";
import {
	formatCurrencyValue,
	formatDateTimeValue,
	formatNumericValue,
} from "../src";

describe("macro display formatters", () => {
	test("formats numbers with configured grouping, precision, and negative style", () => {
		expect(
			formatNumericValue(12345.6, {
				decimalDigits: 2,
				thousandsSeparator: ",",
				decimalPoint: ".",
				exact: true,
			}),
		).toBe("12,345.60");
		expect(
			formatNumericValue(-12.5, {
				decimalDigits: 2,
				decimalPoint: ",",
				negativeStyle: "parens",
			}),
		).toBe("(12,5)");
	});

	test("formats currencies through currency configuration", () => {
		expect(
			formatCurrencyValue(-1234.5, "EUR", {
				definitions: [{ code: "EUR", decimals: 2, symbols: ["€"] }],
				thousandsSeparator: ".",
				decimalSeparator: ",",
				position: "suffix",
				negativeStyle: "parens",
			}),
		).toBe("(1.234,50) €");
	});

	test("formats configured date token order and localized month names", () => {
		expect(
			formatDateTimeValue(
				{ year: 2026, month: 8, day: 17 },
				{
					tokens: ["DD", "MM", "YYYY"],
					separators: [".", "."],
					options: { locale: "en-US" },
				},
			),
		).toBe("17.08.2026");
		expect(
			formatDateTimeValue(
				{ year: 2026, month: 8, day: 17 },
				{
					tokens: ["MM_name", "YYYY"],
					separators: [" "],
					options: { locale: "de-DE" },
				},
			),
		).toContain("August 2026");
	});
});
