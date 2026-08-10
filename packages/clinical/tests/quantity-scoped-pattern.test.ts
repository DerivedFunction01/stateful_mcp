import { describe, expect, test } from "bun:test";
import {
	buildScopedParameterRegex,
	parseCompoundQuantity,
	resolveQuantityUnitDisplay,
} from "../src/setup/quantity-grammar-compiler";
import type { QuantityGrammarProfile } from "../src/values/quantity-profile-types";

describe("Scoped Quantity Patterns & Unit Preference Scoping", () => {
	const baseProfile: QuantityGrammarProfile = {
		profileId: "length_profile",
		label: "Length Profile",
		version: 1,
		decimalSeparator: ".",
		thousandsSeparator: ",",
		unitAliases: {
			mm: "mm",
			cm: "cm",
			m: "m",
			km: "km",
			in: "in",
			ft: "ft",
		},
		unitDisplayOverrides: {
			cm: "centimeters",
		},
		operatorAliases: {
			">": "gt",
			"<": "lt",
		},
		rangeDelimiters: ["to", "-"],
		ordering: {
			unitOrder: "suffix",
			rangePattern: "distributive_suffix",
		},
		measurementWordBoundary: "both",
		compoundPatterns: [
			{
				patternId: "feet_inches",
				regexPattern: "^(?<primary>\\d+)'\\s*(?<secondary>\\d+)\"?$",
				primaryUnit: "ft",
				secondaryUnit: "in",
			},
		],
	};

	test("buildScopedParameterRegex scopes regex to activeUnits subset", () => {
		// Only cm, m, mm active
		const metricPattern = buildScopedParameterRegex(baseProfile, {
			activeUnits: ["cm", "m", "mm"],
		});
		const regex = new RegExp(metricPattern);

		// Standalone matches or within word boundaries
		expect(regex.test("175 cm")).toBe(true);
		expect(regex.test("2 m")).toBe(true);
		expect(regex.test("50 mm")).toBe(true);
		// ft is not active, so it should not match
		expect(regex.test("5 ft")).toBe(false);
	});

	test("resolveQuantityUnitDisplay handles overrides, defaults, and fallbacks", () => {
		// Overridden in profile
		expect(resolveQuantityUnitDisplay(baseProfile, "cm")).toBe("centimeters");

		// Default in UNIT_DISPLAY_MAP (e.g. Celsius -> °C)
		expect(resolveQuantityUnitDisplay(baseProfile, "Celsius")).toBe("°C");

		// Fallback to raw key
		expect(resolveQuantityUnitDisplay(baseProfile, "unknown_unit")).toBe(
			"unknown_unit",
		);
	});

	test("parseCompoundQuantity extracts two-part values from input text", () => {
		const res = parseCompoundQuantity("5'11\"", baseProfile);
		expect(res).toBeDefined();
		expect(res?.primaryValue).toBe(5);
		expect(res?.primaryUnit).toBe("ft");
		expect(res?.secondaryValue).toBe(11);
		expect(res?.secondaryUnit).toBe("in");

		const resSpaces = parseCompoundQuantity("6' 2\"", baseProfile);
		expect(resSpaces).toBeDefined();
		expect(resSpaces?.primaryValue).toBe(6);
		expect(resSpaces?.secondaryValue).toBe(2);

		const nonMatch = parseCompoundQuantity("175 cm", baseProfile);
		expect(nonMatch).toBeUndefined();
	});
});
