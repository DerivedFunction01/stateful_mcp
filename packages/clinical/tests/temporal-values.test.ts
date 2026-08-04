import { describe, expect, it } from "bun:test";
import {
	bootstrapFrequencyDefaults,
	bootstrapNumericalDefaults,
} from "../src/bootstrap/bootstrap-config";
import { resolveFrequency } from "../src/values/frequency-resolver";
import { createNumericalSyntaxProfile } from "../src/values/numerical-syntax-profile";
import { recognizeTemporalExpression } from "../src/values/temporal-recognizer";
import { resolveTemporalExpression } from "../src/values/temporal-resolver";

const anchor = {
	referenceInstant: "2026-08-03T17:30:30-04:00",
	timezone: "America/New_York",
};

describe(" temporal values", () => {
	it("recognizes configurable relative-day aliases", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		expect(recognizeTemporalExpression("today", profile).expression).toEqual({
			kind: "relative_day",
			offsetDays: 0,
		});
		expect(
			recognizeTemporalExpression("yesterday", profile).expression,
		).toEqual({
			kind: "relative_day",
			offsetDays: -1,
		});
		expect(recognizeTemporalExpression("tomorrow", profile).expression).toEqual(
			{
				kind: "relative_day",
				offsetDays: 1,
			},
		);
		expect(
			recognizeTemporalExpression("now", profile).expression,
		).toBeUndefined();
	});

	it("resolves relative days against an explicit anchor", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const expression = recognizeTemporalExpression("today", profile)
			.expression!;
		const result = resolveTemporalExpression(expression, anchor);
		expect(result.diagnostics).toEqual([]);
		expect(result.value?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2026-08-03T04:00:00.000Z",
		);
		expect(result.value?.time?.endDatetime?.assertedTimestampUtc).toBe(
			"2026-08-04T04:00:00.000Z",
		);
	});

	it("preserves relative mathematical semantics", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const expression = recognizeTemporalExpression("3 days ago", profile)
			.expression!;
		expect(
			resolveTemporalExpression(expression, anchor).value?.relativeEstimate,
		).toEqual({
			direction: "retrospective",
			firstValue: 3,
			precisionUnit: "day",
		});
	});

	it("uses dateTimeFormats (DD/MM/YYYY) inside the temporal sub-profile", () => {
		const profile = createNumericalSyntaxProfile({
			profileId: "date-profile",
			temporal: {
				dateTimeFormats: [
					{
						tokens: ["DD", "MM", "YYYY"],
						separators: ["/", "/"],
						options: { exact: true, precision: "day" },
					},
				],
				relativeDayAliases: {},
				unitAliases: {},
				directionAliases: {},
				rangeDelimiters: [],
			},
		});
		const expression = recognizeTemporalExpression(
			"03/08/2026",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T00:00:00.000Z",
			precision: "day",
		});
	});

	it("recognizes ISO date-only via bootstrap profile (precision day)", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const expression = recognizeTemporalExpression(
			"2026-08-03",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T00:00:00.000Z",
			precision: "day",
		});
	});

	it("recognizes ISO date-time with timezone via bootstrap profile (precision second)", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const expression = recognizeTemporalExpression(
			"2026-08-03T17:30:00 -04:00",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T17:30:00-04:00",
			precision: "second",
		});
	});

	it("recognizes ISO date-time without timezone via bootstrap profile (precision second)", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		const expression = recognizeTemporalExpression(
			"2026-08-03T17:30:00",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T17:30:00.000Z",
			precision: "second",
		});
	});

	it("rejects invalid dates (month 13, day 99)", () => {
		const profile = createNumericalSyntaxProfile(
			{ profileId: "v2-numerical-default" },
			bootstrapNumericalDefaults,
		);
		expect(
			recognizeTemporalExpression("2026-13-01", profile).expression,
		).toBeUndefined();
		expect(
			recognizeTemporalExpression("2026-08-99", profile).expression,
		).toBeUndefined();
	});

	it("explicit precision option overrides HH-presence inference", () => {
		const profile = createNumericalSyntaxProfile({
			profileId: "explicit-precision",
			temporal: {
				dateTimeFormats: [
					{
						tokens: ["DD", "MM", "YYYY", "HH", "min"],
						separators: ["/", "/", " ", ":"],
						options: { exact: true, is24Hour: true, precision: "minute" },
					},
				],
				relativeDayAliases: {},
				unitAliases: {},
				directionAliases: {},
				rangeDelimiters: [],
			},
		});
		const expression = recognizeTemporalExpression(
			"03/08/2026 17:30",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T17:30:00.000Z",
			precision: "minute",
		});
	});

	it("recognizes configured tokenized date and time formats", () => {
		const profile = createNumericalSyntaxProfile({
			profileId: "tokenized",
			temporal: {
				dateTimeFormats: [
					{
						tokens: ["DD", "MM", "YYYY", "HH", "min", "ampm", "tz"],
						separators: ["/", "/", " ", ":", " ", " "],
						options: {
							is24Hour: false,
							dayPeriods: { am: ["vorm."], pm: ["nachm."] },
						},
					},
				],
				relativeDayAliases: {},
				unitAliases: {},
				directionAliases: {},
				rangeDelimiters: [],
			},
		});
		const expression = recognizeTemporalExpression(
			"03/08/2026 05:30 nachm. -04:00",
			profile,
		).expression;
		expect(expression).toEqual({
			kind: "absolute_instant",
			instant: "2026-08-03T17:30:00-04:00",
			precision: "second",
		});
	});

	it("resolves configured frequency shorthand without parser dependencies", () => {
		expect(
			resolveFrequency(
				{
					alias: "BID",
					prn: true,
					eventAnchor: "with_meal",
					prnReason: { conceptId: "pain", display: "Pain" },
				},
				bootstrapFrequencyDefaults,
			),
		).toEqual({
			cadenceType: "event_anchored",
			interval: undefined,
			rate: undefined,
			eventAnchor: "with_meal",
			isPrn: true,
			prnReason: { conceptId: "pain", display: "Pain" },
		});
	});
});
