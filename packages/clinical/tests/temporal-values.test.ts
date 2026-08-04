import { describe, expect, it } from "bun:test";
import {
	bootstrapFrequencyDefaults,
	bootstrapTemporalDefaults,
} from "../src/bootstrap/bootstrap-config";
import { resolveFrequency } from "../src/values/frequency-resolver";
import { recognizeTemporalExpression } from "../src/values/temporal-recognizer";
import { resolveTemporalExpression } from "../src/values/temporal-resolver";
import { createTemporalSyntaxProfile } from "../src/values/temporal-syntax-profile";

const anchor = {
	referenceInstant: "2026-08-03T17:30:30-04:00",
	timezone: "America/New_York",
};

describe(" temporal values", () => {
	it("recognizes configurable relative-day aliases", () => {
		const profile = createTemporalSyntaxProfile(
			{ profileId: "v2-temporal-default" },
			bootstrapTemporalDefaults,
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
		const profile = createTemporalSyntaxProfile(
			{ profileId: "v2-temporal-default" },
			bootstrapTemporalDefaults,
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
		const profile = createTemporalSyntaxProfile(
			{ profileId: "v2-temporal-default" },
			bootstrapTemporalDefaults,
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

	it("uses profile date rules instead of hardcoded date formats", () => {
		const profile = createTemporalSyntaxProfile(
			{
				profileId: "date-profile",
				dateRecognitionRules: [
					{
						pattern: "^(?<day>\\d{2})/(?<month>\\d{2})/(?<year>\\d{4})$",
						precision: "day",
						yearGroup: "year",
						monthGroup: "month",
						dayGroup: "day",
					},
				],
			},
			bootstrapTemporalDefaults,
		);
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

	it("recognizes configured tokenized date and time formats", () => {
		const profile = createTemporalSyntaxProfile({
			profileId: "tokenized",
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
