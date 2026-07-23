import { describe, expect, test } from "bun:test";
import { ClinicalDateRangeSchemaParser } from "../src/parser/parsers/clinical-date-range-parser";

describe("ClinicalDateRange parsing", () => {
	const parser = new ClinicalDateRangeSchemaParser();
	const store = {
		resolve: async () => null,
		search: async () => [],
	} as any;

	test("parses retrospective and prospective relative estimates", async () => {
		const retrospective = await parser.parse("#time", "3 weeks ago", store);
		expect(retrospective?.dateRange?.relativeEstimate).toEqual({
			direction: "retrospective",
			firstValue: 3,
			precisionUnit: "week",
		});

		const prospective = await parser.parse("#time", "in 2 hours", store);
		expect(prospective?.dateRange?.relativeEstimate).toEqual({
			direction: "prospective",
			firstValue: 2,
			precisionUnit: "hour",
		});
	});

	test("parses recurring cadence and shorthand schedules", async () => {
		const cadence = await parser.parse("#time", "every 8 hours", store);
		expect(cadence?.dateRange?.time?.repeat).toEqual({
			multiplier: 8,
			level: "hour",
		});

		const daily = await parser.parse("#time", "daily", store);
		expect(daily?.dateRange?.time?.repeat).toEqual({
			multiplier: 1,
			level: "day",
		});
	});

	test("parses absolute start and end bounds", async () => {
		const bounded = await parser.parse(
			"#time",
			"from Monday to Wednesday",
			store,
		);
		expect(bounded?.dateRange?.time?.startDatetime?.precisionLevel).toBe(
			"monday",
		);
		expect(bounded?.dateRange?.time?.endDatetime?.precisionLevel).toBe(
			"wednesday",
		);
		expect(
			bounded?.dateRange?.time?.startDatetime?.assertedTimestampUtc,
		).toMatch(/T00:00:00Z$/);
		expect(bounded?.dateRange?.time?.endDatetime?.assertedTimestampUtc).toMatch(
			/T23:59:59Z$/,
		);
	});

	test("parses exclusions alongside the base schedule", async () => {
		const parsed = await parser.parse("#time", "daily except Sundays", store);
		expect(parsed?.dateRange?.includedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.excludedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.includedDatetimes?.[0]?.time?.repeat).toEqual({
			multiplier: 1,
			level: "day",
		});
		expect(parsed?.dateRange?.excludedDatetimes?.[0]?.time?.repeat).toEqual({
			multiplier: 1,
			level: "sunday",
		});
	});

	test("combines repeat cadence and bounds in a single time range", async () => {
		const parsed = await parser.parse(
			"#time",
			"every 8 hours from Monday to Wednesday",
			store,
		);
		expect(parsed?.dateRange?.time?.repeat).toEqual({
			multiplier: 8,
			level: "hour",
		});
		expect(parsed?.dateRange?.time?.startDatetime?.precisionLevel).toBe(
			"monday",
		);
		expect(parsed?.dateRange?.time?.endDatetime?.precisionLevel).toBe(
			"wednesday",
		);
	});
});
