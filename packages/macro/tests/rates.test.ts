import { describe, expect, test } from "bun:test";
import {
	type CompoundRateConfig,
	parseCompoundRate,
} from "../src/values/rates";

const TEST_RATE_CONFIG: CompoundRateConfig = {
	quantityConfig: {
		unitAliases: {
			mg: ["mg", "milligram", "milligrams"],
			mcg: ["mcg", "microgram", "micrograms"],
			kg: ["kg", "kilogram"],
			g: ["g", "gram"],
			mL: ["mL", "ml"],
			L: ["L", "liter"],
			min: ["min", "minute", "minutes"],
			hr: ["hr", "hour", "hours"],
			day: ["day", "days", "d"],
		},
	},
	currencyConfig: {
		currencies: {
			USD: ["$"],
			EUR: ["€"],
		},
	},
	operatorConfig: {
		prefixAliases: {
			greater_equal: [">=", "at least"],
			less_equal: ["<=", "at most"],
			approximate: ["~", "approx"],
		},
	},
	rateDelimiters: ["/", "per", "por", "pro", "je", "每"],
};

describe("Universal Compound Rate & Multi-Divisor Engine (rates.ts)", () => {
	describe("1. Clinical Dosage Multi-Divisor Rates", () => {
		test("parses chained 2-denominator clinical rates (e.g. 10 mg/kg/day)", () => {
			const res = parseCompoundRate("10 mg/kg/day", TEST_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.kind).toBe("rate");

			if (res.value?.numerator.type === "quantity") {
				expect(res.value.numerator.quantity.magnitude).toBe(10);
				expect(res.value.numerator.quantity.unit).toBe("mg");
			} else {
				throw new Error("Expected quantity numerator");
			}

			expect(res.value?.denominators).toHaveLength(2);
			expect(res.value?.denominators[0]?.unit).toBe("kg");
			expect(res.value?.denominators[0]?.magnitude).toBe(1);
			expect(res.value?.denominators[1]?.unit).toBe("day");
			expect(res.value?.denominators[1]?.magnitude).toBe(1);
		});

		test("parses rates with natural language delimiters (e.g. 10 mg per kg per day)", () => {
			const res = parseCompoundRate("10 mg per kg per day", TEST_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.denominators).toHaveLength(2);
			expect(res.value?.denominators[0]?.unit).toBe("kg");
			expect(res.value?.denominators[1]?.unit).toBe("day");
		});

		test("parses denominator with explicit magnitude (e.g. 50 mL / 2 hours)", () => {
			const res = parseCompoundRate("50 mL / 2 hours", TEST_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.denominators[0]?.magnitude).toBe(2);
			expect(res.value?.denominators[0]?.unit).toBe("hr");
		});
	});

	describe("2. Financial Rates", () => {
		test("parses hourly and daily financial rates (e.g. $50/hr, €120/day)", () => {
			const resUSD = parseCompoundRate("$50/hr", TEST_RATE_CONFIG);
			expect(resUSD.diagnostics).toHaveLength(0);
			if (resUSD.value?.numerator.type === "currency") {
				expect(resUSD.value.numerator.currency.amount).toBe(50);
				expect(resUSD.value.numerator.currency.currency).toBe("USD");
			} else {
				throw new Error("Expected currency numerator");
			}
			expect(resUSD.value?.denominators[0]?.unit).toBe("hr");

			const resEUR = parseCompoundRate("€120/day", TEST_RATE_CONFIG);
			expect(resEUR.diagnostics).toHaveLength(0);
			if (resEUR.value?.numerator.type === "currency") {
				expect(resEUR.value.numerator.currency.amount).toBe(120);
				expect(resEUR.value.numerator.currency.currency).toBe("EUR");
			} else {
				throw new Error("Expected currency numerator");
			}
		});
	});

	describe("3. Rates with Operators & Policy Enforcement", () => {
		test("extracts prefix operators on rates (e.g. >= 10 mg/kg/day, at least $50/hr)", () => {
			const res = parseCompoundRate(">= 10 mg/kg/day", TEST_RATE_CONFIG);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.operator?.operator).toBe("greater_equal");

			const resFin = parseCompoundRate("at least $50/hr", TEST_RATE_CONFIG);
			expect(resFin.diagnostics).toHaveLength(0);
			expect(resFin.value?.operator?.operator).toBe("greater_equal");
		});

		test("enforces maxDenominators policy", () => {
			const res = parseCompoundRate("10 mg/kg/day", TEST_RATE_CONFIG, {
				maxDenominators: 1,
			});
			expect(res.value).toBeUndefined();
			expect(res.diagnostics[0]?.code).toBe("too_many_denominators");
		});
	});

	describe("4. Adversarial Configuration (Zero Hardcoded Delimiters)", () => {
		test("respects custom user rate delimiters without default fallback", () => {
			// Purposely use '||' as the only rate delimiter
			const customConfig: CompoundRateConfig = {
				quantityConfig: {
					unitAliases: {
						mg: ["mg"],
						kg: ["kg"],
					},
				},
				rateDelimiters: ["||"],
			};

			const res = parseCompoundRate("10 mg || kg", customConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.denominators[0]?.unit).toBe("kg");

			// Standard '/' is NOT recognized when unconfigured
			const resSlash = parseCompoundRate("10 mg / kg", customConfig);
			expect(resSlash.value).toBeUndefined();
			expect(resSlash.diagnostics[0]?.code).toBe("not_a_rate");
		});
	});
});
