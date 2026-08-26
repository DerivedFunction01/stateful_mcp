import { describe, expect, test } from "bun:test";
import {
	createDateTimeRegistry,
	formatCurrencyValue,
	formatDateTimeValue,
	formatNumericValue,
	selectDateTimeFormats,
	validateDateTimeRegistry,
} from "../../src";

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

describe("canonical date/time format registry", () => {
	const registry = {
		formats: {
			monthYear: {
				id: "monthYear",
				kind: "date" as const,
				tokens: ["MM", "YYYY"] as const,
				separators: ["/"],
			},
			monthDayYear: {
				id: "monthDayYear",
				kind: "date" as const,
				tokens: ["MM", "DD", "YYYY"] as const,
				separators: ["/", "/"],
			},
			minutes: {
				id: "minutes",
				kind: "time" as const,
				tokens: ["HH", "min"] as const,
				separators: [":"],
			},
		},
		display: { date: "monthDayYear", time: "minutes" },
		parse: {
			date: ["monthYear", "monthDayYear"],
			time: ["minutes"],
			datetime: [],
		},
	};

	test("selects profile formats by required semantic fields", () => {
		expect(
			selectDateTimeFormats(registry, {
				role: "date",
				requiredFields: ["month", "year"],
			}).map((format) => format.id),
		).toEqual(["monthYear", "monthDayYear"]);
		expect(
			selectDateTimeFormats(registry, {
				role: "date",
				requiredFields: ["month", "day"],
				allowAdditionalFields: true,
			}).map((format) => format.id),
		).toEqual(["monthDayYear"]);
	});

	test("validates registry references and migrates legacy date config", () => {
		expect(validateDateTimeRegistry(registry)).toHaveLength(0);
		expect(
			createDateTimeRegistry({
				id: "legacy",
				tokens: ["MM", "DD"],
				separators: ["/"],
			}).parse.date,
		).toEqual(["legacy"]);
	});
});
