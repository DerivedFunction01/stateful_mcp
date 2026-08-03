import { describe, expect, it } from "bun:test";
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
		expect(recognizeTemporalExpression("today").expression).toEqual({
			kind: "relative_day",
			offsetDays: 0,
		});
		expect(recognizeTemporalExpression("yesterday").expression).toEqual({
			kind: "relative_day",
			offsetDays: -1,
		});
		expect(recognizeTemporalExpression("tomorrow").expression).toEqual({
			kind: "relative_day",
			offsetDays: 1,
		});
		expect(recognizeTemporalExpression("now").expression).toBeUndefined();
	});

	it("resolves relative days against an explicit anchor", () => {
		const expression = recognizeTemporalExpression("today").expression!;
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
		const expression = recognizeTemporalExpression("3 days ago").expression!;
		expect(
			resolveTemporalExpression(expression, anchor).value?.relativeEstimate,
		).toEqual({
			direction: "retrospective",
			firstValue: 3,
			precisionUnit: "day",
		});
	});

	it("uses profile date rules instead of hardcoded date formats", () => {
		const profile = createTemporalSyntaxProfile({
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

	it("resolves configured frequency shorthand without parser dependencies", () => {
		expect(
			resolveFrequency({
				alias: "BID",
				prn: true,
				eventAnchor: "with_meal",
				prnReason: { conceptId: "pain", display: "Pain" },
			}),
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
