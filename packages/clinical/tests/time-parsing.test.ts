import { describe, expect, test } from "bun:test";
import type { DictionaryStore } from "@stateful-mcp/core";
import { ClinicalDateRangeSchemaParser } from "../src/parser/parsers/clinical-date-range-parser";
import {
	buildCalendarDateRules,
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_CALENDAR_DATE_FORMATS,
	DEFAULT_EVALUATOR_RULES,
} from "../src/store/defaults";

const expandedRules = [
	...DEFAULT_ATTRIBUTE_RULES,
	...buildCalendarDateRules(DEFAULT_CALENDAR_DATE_FORMATS),
];

const rangeListRules = [
	...expandedRules,
	{
		targetField: "calendar_date_range",
		targetValue: "calendar_date_range",
		regexPatterns: [
			"(?<start>\\d{2}\\/\\d{2}\\/\\d{4})\\s*(?:to|until|through|hasta|a)\\s*(?<end>\\d{2}\\/\\d{2}\\/\\d{4})",
		],
		isCaseInsensitive: true,
		priority: 110,
	},
	{
		targetField: "calendar_date_list",
		targetValue: "calendar_date_list",
		regexPatterns: [
			"(?<dates>\\b(?:\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}, \\d{4})(?:\\s*,\\s*(?:\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}, \\d{4}))+)\\b",
		],
		isCaseInsensitive: true,
		priority: 109,
	},
];

const parser = new ClinicalDateRangeSchemaParser();
const store = {
	resolve: async () => null,
	search: async () => [],
} as DictionaryStore;

describe("ClinicalDateRange parsing", () => {
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

	test("parses exact calendar exclusions alongside the base schedule", async () => {
		const parsed = await parser.parse(
			"#time",
			"daily except January 15, 2026",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(parsed?.dateRange?.includedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.excludedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.includedDatetimes?.[0]?.time?.repeat).toEqual({
			multiplier: 1,
			level: "day",
		});
		expect(parsed?.dateRange?.excludedDatetimes?.[0]?.time?.startDatetime)
			.toBeDefined();
		expect(
			parsed?.dateRange?.excludedDatetimes?.[0]?.time?.startDatetime
				?.assertedTimestampUtc,
		).toBe("2026-01-15T00:00:00Z");
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

	test("fills the date range object with repeat, calendar boundaries, and exact exclusions", async () => {
		const parsed = await parser.parse(
			"#time",
			"every 8 hours from Monday to Wednesday except January 15, 2026",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
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
		expect(parsed?.dateRange?.includedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.excludedDatetimes).toHaveLength(1);
		expect(parsed?.dateRange?.excludedDatetimes?.[0]?.time?.startDatetime)
			.toBeDefined();
		expect(
			parsed?.dateRange?.excludedDatetimes?.[0]?.time?.startDatetime
				?.assertedTimestampUtc,
		).toBe("2026-01-15T00:00:00Z");
	});
});

describe("ClinicalDateRange calendar date parsing", () => {
	test("parses MM/DD/YYYY format", async () => {
		const result = await parser.parse(
			"#time",
			"01/15/2023",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeDefined();
		expect(result?.dateRange?.time?.startDatetime?.precisionLevel).toBe("day");
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2023-01-15T00:00:00Z",
		);
	});

	test("parses YYYY-MM-DD format", async () => {
		const result = await parser.parse(
			"#time",
			"2023-01-15",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeDefined();
		expect(result?.dateRange?.time?.startDatetime?.precisionLevel).toBe("day");
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2023-01-15T00:00:00Z",
		);
	});

	test("parses MM_name DD, YYYY format with English month names", async () => {
		const result = await parser.parse(
			"#time",
			"January 15, 2023",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeDefined();
		expect(result?.dateRange?.time?.startDatetime?.precisionLevel).toBe("day");
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2023-01-15T00:00:00Z",
		);
	});

	test("parses Spanish month names when profile overrides monthNames", async () => {
		const spanishRules = [
			...DEFAULT_ATTRIBUTE_RULES,
			...buildCalendarDateRules([
				{
					tokens: ["MM_name", "DD", "YYYY"],
					separators: [" ", ", "],
					options: {
						is24Hour: false,
						monthNames: [
							"Enero",
							"Febrero",
							"Marzo",
							"Abril",
							"Mayo",
							"Junio",
							"Julio",
							"Agosto",
							"Septiembre",
							"Octubre",
							"Noviembre",
							"Diciembre",
						],
					},
				},
			]),
		];

		const result = await parser.parse(
			"#time",
			"Enero 15, 2023",
			store,
			undefined,
			spanishRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeDefined();
		expect(result?.dateRange?.time?.startDatetime?.precisionLevel).toBe("day");
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2023-01-15T00:00:00Z",
		);
	});

	test("does not resolve MM_name without monthNames in config", async () => {
		const noMonthNameRules = [
			...DEFAULT_ATTRIBUTE_RULES,
			...buildCalendarDateRules([
				{
					tokens: ["MM", "DD", "YYYY"],
					separators: ["/", "/"],
					options: { is24Hour: false },
				},
			]),
		];

		const result = await parser.parse(
			"#time",
			"January 15, 2023",
			store,
			undefined,
			noMonthNameRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeUndefined();
	});

	test("parses calendar dates with time components", async () => {
		const timeRules = [
			...DEFAULT_ATTRIBUTE_RULES,
			...buildCalendarDateRules([
				{
					tokens: ["MM", "DD", "YYYY", "HH", "min"],
					separators: ["/", "/", " ", ":"],
					options: { is24Hour: true },
				},
			]),
		];

		const result = await parser.parse(
			"#time",
			"01/15/2023 14:30",
			store,
			undefined,
			timeRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime).toBeDefined();
		expect(result?.dateRange?.time?.startDatetime?.precisionLevel).toBe(
			"minute",
		);
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2023-01-15T14:30:00Z",
		);
	});

	test("parses named-group date ranges without relying on hardcoded boundary order", async () => {
		const result = await parser.parse(
			"#time",
			"01/15/2026 to 01/20/2026",
			store,
			undefined,
			rangeListRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.time?.startDatetime?.assertedTimestampUtc).toBe(
			"2026-01-15T00:00:00Z",
		);
		expect(result?.dateRange?.time?.endDatetime?.assertedTimestampUtc).toBe(
			"2026-01-20T00:00:00Z",
		);
	});

	test("parses named-group date lists into included datetimes", async () => {
		const result = await parser.parse(
			"#time",
			"January 15, 2026, January 20, 2026, January 22, 2026",
			store,
			undefined,
			rangeListRules,
			DEFAULT_EVALUATOR_RULES,
		);
		expect(result?.dateRange?.includedDatetimes).toHaveLength(3);
		expect(result?.dateRange?.includedDatetimes?.[0]?.time?.startDatetime?.assertedTimestampUtc)
			.toBe("2026-01-15T00:00:00Z");
		expect(result?.dateRange?.includedDatetimes?.[1]?.time?.startDatetime?.assertedTimestampUtc)
			.toBe("2026-01-20T00:00:00Z");
		expect(result?.dateRange?.includedDatetimes?.[2]?.time?.startDatetime?.assertedTimestampUtc)
			.toBe("2026-01-22T00:00:00Z");
	});
});

describe("ClinicalDateRange memoization", () => {
	test("calendar_date rules hit memoized regex cache after first parse", async () => {
		const { getCompiledRegex } = await import("../src/parser/_compiled-regex");

		const calendarRules = expandedRules.filter(
			(r) => r.targetField === "calendar_date",
		);
		const firstPattern = calendarRules[0]?.regexPatterns[0];
		if (!firstPattern) return;

		const first = getCompiledRegex(firstPattern, "gi");
		await parser.parse(
			"#time",
			"01/15/2023",
			store,
			undefined,
			expandedRules,
			DEFAULT_EVALUATOR_RULES,
		);
		const second = getCompiledRegex(firstPattern, "gi");
		expect(first).toBe(second);
	});
});
