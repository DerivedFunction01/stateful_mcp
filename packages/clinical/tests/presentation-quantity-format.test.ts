import { describe, expect, test } from "bun:test";
import { formatQuantity } from "../src/presentation/quantity-format";

describe("quantity display recovery", () => {
	test("formats units, comparisons, ranges, and locales", () => {
		expect(
			formatQuantity({ magnitude: 38.9, unit: { display: "Celsius" } }).text,
		).toBe("38.9 °C");
		expect(
			formatQuantity({ magnitude: 3, unit: { display: "mg" }, operator: "gte" })
				.text,
		).toBe("≥ 3 mg");
		expect(
			formatQuantity({
				low: { magnitude: 3, unit: { display: "mg" } },
				high: { magnitude: 5, unit: { display: "mg" } },
			}).text,
		).toBe("3–5 mg");
		expect(
			formatQuantity(
				{ magnitude: 1234.5, unit: { display: "mg" } },
				{ locale: "de-DE" },
			).text,
		).toBe("1.234,5 mg");
	});

	test("uses profile unit and operator overrides", () => {
		const result = formatQuantity(
			{ magnitude: 3, unit: { display: "day" }, operator: "gte" },
			{
				profile: {
					quantityDisplay: {
						units: { day: { short: "days" } },
						operators: { gte: { symbol: "at least" } },
					},
				} as any,
			},
		);
		expect(result.text).toBe("at least 3 days");
	});
});
