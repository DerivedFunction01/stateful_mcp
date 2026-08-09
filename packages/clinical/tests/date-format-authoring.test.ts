import { describe, expect, it } from "bun:test";
import {
	findAmbiguousDateExamples,
	previewDateTimeFormat,
} from "../src/setup/date-format-authoring";
import { createDefaultSetupSource } from "../src/setup/setup-defaults";

describe("explicit date format authoring", () => {
	it("matches an explicitly ordered format with arbitrary separators", () => {
		const format = {
			id: "word-separated",
			tokens: ["DD", "MM", "YYYY", "HH", "min" as const],
			separators: [" day ", " month ", " at ", ":"],
			options: { exact: true, is24Hour: true, precision: "minute" as const },
		};

		const result = previewDateTimeFormat(format, ["23 day 3 month 2016 at 14:05"]);

		expect(result.valid).toBe(true);
		expect(result.matches[0]?.captures.dd).toBe("23");
		expect(result.matches[0]?.captures.yyyy).toBe("2016");
	});

	it("maps multiple aliases to semantic month numbers", () => {
		const format = {
			id: "named-month",
			tokens: ["MM_name", "DD", "YYYY"] as const,
			separators: [" ", ", "],
			options: {
				exact: true,
				monthAliases: Array.from({ length: 12 }, (_, index) => index === 0 ? ["Jan", "January", "Januarry"] : [`m${index + 1}`]),
			},
		};

		const result = previewDateTimeFormat(format, ["Januarry 23, 2026"]);

		expect(result.valid).toBe(true);
		expect(result.matches[0]?.captures.mm_name).toBe("Januarry");
	});

	it("rejects a configured format without a passing example or aliases", () => {
		const result = previewDateTimeFormat({
			id: "unconfirmed",
			tokens: ["MM_name"],
			separators: [],
		}, []);

		expect(result.valid).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toEqual([
			"missing_month_aliases",
			"missing_example",
		]);
	});

	it("detects ambiguity across explicitly configured formats", () => {
		const formats = [
			{ id: "day-first", tokens: ["DD", "MM", "YYYY"] as const, separators: ["/", "/"], options: { exact: true } },
			{ id: "month-first", tokens: ["MM", "DD", "YYYY"] as const, separators: ["/", "/"], options: { exact: true } },
		];

		expect(findAmbiguousDateExamples(formats, "03/04/2026")).toEqual(["day-first", "month-first"]);
	});

	it("does not initialize setup numeric or unit conventions", () => {
		const source = createDefaultSetupSource("unset");

		expect(source.primitiveProfile.decimalSeparator).toBeUndefined();
		expect(source.primitiveProfile.measurementUnitOrder).toBeUndefined();
	});
});
