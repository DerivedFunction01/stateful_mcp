import { describe, expect, it } from "bun:test";
import { bootstrapNumericalDefaults } from "../src/bootstrap/bootstrap-config";
import { UNIT_DISPLAY_MAP } from "../src/schemas/schemas-interface/measurement";
import {
	createNumericalSyntaxProfile,
	normalizeNumberWords,
	resolveUnitDisplay,
} from "../src/values/numerical-syntax-profile";
import { recognizeTemporalExpression } from "../src/values/temporal-recognizer";
import type { NumberWordConfig } from "../src/values/utils/number-word-normalizer";

const englishNumberWords: NumberWordConfig = {
	atoms: {
		0: "zero",
		1: "one",
		2: "two",
		3: "three",
		4: "four",
		5: "five",
		6: "six",
		7: "seven",
		8: "eight",
		9: "nine",
		10: "ten",
		11: "eleven",
		12: "twelve",
		13: "thirteen",
		14: "fourteen",
		15: "fifteen",
		16: "sixteen",
		17: "seventeen",
		18: "eighteen",
		19: "nineteen",
		20: "twenty",
		30: "thirty",
		40: "forty",
		50: "fifty",
	},
	scales: [
		{ value: 100, word: "hundred", type: "minor" },
		{ value: 1000, word: "thousand", type: "major" },
	],
	conjunctions: ["and"],
};

describe("NumericalSyntaxProfile", () => {
	it("createNumericalSyntaxProfile: applies defaults for missing fields", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "test" },
			bootstrapNumericalDefaults,
		);
		expect(profile.profileId).toBe("test");
		expect(profile.numberWords).toBeNull();
		expect(profile.unitDisplay).toEqual({});
		expect(profile.temporal.relativeDayAliases).toEqual(
			bootstrapNumericalDefaults.temporal.relativeDayAliases,
		);
		expect(profile.temporal.dateTimeFormats.length).toBe(3);
	});

	it("createNumericalSyntaxProfile: caller-supplied fields win over defaults", () => {
		const profile = createNumericalSyntaxProfile(
			{
				profileId: "override",
				temporal: {
					dateTimeFormats: [],
					relativeDayAliases: { heute: 0 },
					unitAliases: {},
					directionAliases: {},
					rangeDelimiters: [],
				},
				unitDisplay: { ug: "μg" },
			},
			bootstrapNumericalDefaults,
		);
		expect(profile.temporal.relativeDayAliases).toEqual({ heute: 0 });
		expect(profile.temporal.dateTimeFormats).toHaveLength(0);
		expect(profile.unitDisplay).toEqual({ ug: "μg" });
	});

	it("resolveUnitDisplay: falls back to UNIT_DISPLAY_MAP when no override", () => {
		// ug → mcg in the built-in map
		expect(resolveUnitDisplay("ug")).toBe(UNIT_DISPLAY_MAP["ug"]);
		expect(resolveUnitDisplay("mg")).toBe("mg");
	});

	it("resolveUnitDisplay: profile override wins over UNIT_DISPLAY_MAP", () => {
		const profile = createNumericalSyntaxProfile({
			profileId: "custom-display",
			unitDisplay: { ug: "μg" },
		});
		expect(resolveUnitDisplay("ug", profile)).toBe("μg");
		// Non-overridden unit still falls through to the map
		expect(resolveUnitDisplay("mg", profile)).toBe("mg");
	});

	it("resolveUnitDisplay: returns raw unit when not in map or overrides", () => {
		const profile = createNumericalSyntaxProfile({ profileId: "empty" });
		expect(resolveUnitDisplay("furlong", profile)).toBe("furlong");
	});

	it("normalizeNumberWords: returns text unchanged when numberWords is null", () => {
		const profile = createNumericalSyntaxProfile({ profileId: "no-words" });
		expect(normalizeNumberWords("five mg", profile)).toBe("five mg");
		expect(normalizeNumberWords("five mg")).toBe("five mg");
	});

	it("normalizeNumberWords: converts number-words to digits", () => {
		const profile = createNumericalSyntaxProfile({
			profileId: "en",
			numberWords: englishNumberWords,
		});
		expect(normalizeNumberWords("five", profile)).toBe("5");
		expect(normalizeNumberWords("twenty", profile)).toBe("20");
		expect(normalizeNumberWords("one hundred", profile)).toBe("100");
	});

	it("bootstrapNumericalDefaults has expected structure", () => {
		expect(bootstrapNumericalDefaults.numberWords).toBeNull();
		expect(bootstrapNumericalDefaults.unitDisplay).toEqual({});
		expect(bootstrapNumericalDefaults.temporal.rangeDelimiters).toContain("..");
		expect(bootstrapNumericalDefaults.temporal.relativeDayAliases.today).toBe(
			0,
		);
	});

	it("recognizeTemporalExpression accepts NumericalSyntaxProfile directly", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const result = recognizeTemporalExpression("2026-08-03", profile);
		expect(result.expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T00:00:00.000Z",
			precision: "day",
		});
	});
});
