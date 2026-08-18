import { describe, expect, test } from "bun:test";
import {
	type CalendarWindowConfig,
	evaluateAnchorRelativeTemporal,
	type PartOfDayConfig,
	parseRelativeTemporal,
	type RelativeTemporalSlot,
} from "../src";

const TEST_PART_OF_DAY: PartOfDayConfig = {
	windows: {
		morning: { start: "06:00", end: "12:00" },
		afternoon: { start: "12:00", end: "18:00" },
		evening: { start: "18:00", end: "22:00" },
		night: { start: "22:00", end: "06:00" },
	},
};

const TEST_CALENDAR_CONFIG: CalendarWindowConfig = {
	quarters: {
		Q1: { startMonthDay: "01-01", endMonthDay: "03-31" },
		Q2: { startMonthDay: "04-01", endMonthDay: "06-30" },
		Q3: { startMonthDay: "07-01", endMonthDay: "09-30" },
		Q4: { startMonthDay: "10-01", endMonthDay: "12-31" },
	},
	seasons: {
		spring: { startMonthDay: "03-21", endMonthDay: "06-20" },
		summer: { startMonthDay: "06-21", endMonthDay: "09-22" },
		autumn: { startMonthDay: "09-23", endMonthDay: "12-20" },
		winter: { startMonthDay: "12-21", endMonthDay: "03-20" },
	},
};

describe("Universal Chronological & Anchor-Relative Evaluation Engine", () => {
	const ANCHOR_TIMESTAMP = "2026-08-17T12:00:00.000Z";

	describe("1. Instantaneous Unit Offsets (second, minute, hour, day, week)", () => {
		test("evaluates retrospective hour offsets (e.g. 3 hours ago)", () => {
			const slot: RelativeTemporalSlot = {
				direction: "past",
				amount: 3,
				unit: "hour",
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				timeZone: "UTC",
			});
			expect(res.isInstantaneous).toBe(true);
			expect(res.startIsoUtc).toBe("2026-08-17T09:00:00.000Z");
			expect(res.endIsoUtc).toBe("2026-08-17T09:00:00.000Z");
		});

		test("evaluates prospective day offsets (e.g. 2 days in future)", () => {
			const slot: RelativeTemporalSlot = {
				direction: "future",
				amount: 2,
				unit: "day",
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				timeZone: "UTC",
			});
			expect(res.isInstantaneous).toBe(true);
			expect(res.startIsoUtc).toBe("2026-08-19T12:00:00.000Z");
		});
	});

	describe("2. 24-Hour ISO Parts of Day (morning, afternoon, evening)", () => {
		test("evaluates morning on anchor date using 24-hr ISO windows", () => {
			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "hour",
				specificQualifier: "morning",
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				timeZone: "UTC",
				partOfDayConfig: TEST_PART_OF_DAY,
			});
			expect(res.isInstantaneous).toBe(false);
			expect(res.startIsoUtc).toBe("2026-08-17T06:00:00.000Z");
			expect(res.endIsoUtc).toBe("2026-08-17T12:00:00.000Z");
		});

		test("evaluates evening on anchor date using 24-hr ISO windows", () => {
			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "hour",
				specificQualifier: "evening",
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				timeZone: "UTC",
				partOfDayConfig: TEST_PART_OF_DAY,
			});
			expect(res.startIsoUtc).toBe("2026-08-17T18:00:00.000Z");
			expect(res.endIsoUtc).toBe("2026-08-17T22:00:00.000Z");
		});
	});

	describe("3. Quarters, Seasons, Decades & Reference Years", () => {
		test("evaluates specific season in reference year (e.g. summer in 2026)", () => {
			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "season",
				specificQualifier: "summer",
				referenceYear: 2026,
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				calendarConfig: TEST_CALENDAR_CONFIG,
			});
			expect(res.startIsoUtc).toBe("2026-06-21T00:00:00.000Z");
			expect(res.endIsoUtc).toBe("2026-09-22T23:59:59.999Z");
		});

		test("evaluates quarter window (e.g. Q2 2026)", () => {
			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "quarter",
				specificQualifier: "Q2",
				referenceYear: 2026,
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				calendarConfig: TEST_CALENDAR_CONFIG,
			});
			expect(res.startIsoUtc).toBe("2026-04-01T00:00:00.000Z");
			expect(res.endIsoUtc).toBe("2026-06-30T23:59:59.999Z");
		});

		test("evaluates decade range (e.g. 2020s)", () => {
			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "decade",
				referenceYear: 2024,
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP);
			expect(res.startIsoUtc).toBe("2020-01-01T00:00:00.000Z");
			expect(res.endIsoUtc).toBe("2029-12-31T23:59:59.999Z");
		});
	});

	describe("4. Adversarial & Custom 24-hr ISO Windows", () => {
		test("strictly respects custom user time windows without hardcoded assumptions", () => {
			// Custom enterprise morning window: 04:30 to 08:30
			const enterprisePartOfDay: PartOfDayConfig = {
				windows: {
					morning: { start: "04:30", end: "08:30" },
				},
			};

			const slot: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "hour",
				specificQualifier: "morning",
			};

			const res = evaluateAnchorRelativeTemporal(slot, ANCHOR_TIMESTAMP, {
				partOfDayConfig: enterprisePartOfDay,
			});
			expect(res.startIsoUtc).toBe("2026-08-17T04:30:00.000Z");
			expect(res.endIsoUtc).toBe("2026-08-17T08:30:00.000Z");
		});

		test("supports custom US Federal Government fiscal quarters (starts October)", () => {
			// US Gov Fiscal Year (FY): Oct 1 to Sep 30
			// FY2026 Q1 runs from Oct 1, 2025 to Dec 31, 2025 (startYearOffset: -1, endYearOffset: -1)
			// FY2026 Q4 runs from Jul 1, 2026 to Sep 30, 2026 (same calendar year)
			const usGovFiscalConfig: CalendarWindowConfig = {
				quarters: {
					Q1: {
						startMonthDay: "10-01",
						endMonthDay: "12-31",
						startYearOffset: -1,
						endYearOffset: -1,
					},
					Q2: { startMonthDay: "01-01", endMonthDay: "03-31" },
					Q3: { startMonthDay: "04-01", endMonthDay: "06-30" },
					Q4: { startMonthDay: "07-01", endMonthDay: "09-30" },
				},
			};

			// FY2026 Q1 (October - December 2025)
			const slotQ1: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "quarter",
				specificQualifier: "Q1",
				referenceYear: 2026,
			};
			const resQ1 = evaluateAnchorRelativeTemporal(slotQ1, ANCHOR_TIMESTAMP, {
				calendarConfig: usGovFiscalConfig,
			});
			expect(resQ1.startIsoUtc).toBe("2025-10-01T00:00:00.000Z");
			expect(resQ1.endIsoUtc).toBe("2025-12-31T23:59:59.999Z");

			// FY2026 Q4 (July - September 2026)
			const slotQ4: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "quarter",
				specificQualifier: "Q4",
				referenceYear: 2026,
			};
			const resQ4 = evaluateAnchorRelativeTemporal(slotQ4, ANCHOR_TIMESTAMP, {
				calendarConfig: usGovFiscalConfig,
			});
			expect(resQ4.startIsoUtc).toBe("2026-07-01T00:00:00.000Z");
			expect(resQ4.endIsoUtc).toBe("2026-09-30T23:59:59.999Z");
		});

		test("supports cross-year season boundaries (e.g. winter 12-21 to 03-20)", () => {
			const slotWinter: RelativeTemporalSlot = {
				direction: "current",
				amount: 0,
				unit: "season",
				specificQualifier: "winter",
				referenceYear: 2026,
			};
			const resWinter = evaluateAnchorRelativeTemporal(
				slotWinter,
				ANCHOR_TIMESTAMP,
				{
					calendarConfig: TEST_CALENDAR_CONFIG,
				},
			);
			// Start: Dec 21, 2026 -> End: Mar 20, 2027 (automatically inferred across year boundary)
			expect(resWinter.startIsoUtc).toBe("2026-12-21T00:00:00.000Z");
			expect(resWinter.endIsoUtc).toBe("2027-03-20T23:59:59.999Z");
		});
	});

	describe("5. Multi-Lingual Relative Temporal Parsing & Anchor Evaluation", () => {
		const relativeConfig = {
			relativeDefinitions: [
				{
					direction: "current" as const,
					amount: 0,
					unit: "day" as const,
					aliases: ["today", "aujourd'hui", "сегодня", "اليوم", "今天"],
				},
				{
					direction: "past" as const,
					amount: 1,
					unit: "day" as const,
					aliases: ["yesterday", "hier", "вчера", "أمس", "昨天"],
				},
				{
					direction: "future" as const,
					amount: 1,
					unit: "day" as const,
					aliases: ["tomorrow", "demain", "завтра", "غداً", "明天"],
				},
				{
					direction: "past" as const,
					amount: 1,
					unit: "week" as const,
					aliases: [
						"last week",
						"la semaine dernière",
						"прошлая неделя",
						"الأسبوع الماضي",
						"上周",
					],
				},
				{
					direction: "future" as const,
					amount: 1,
					unit: "week" as const,
					aliases: [
						"next week",
						"la semaine prochaine",
						"следующая неделя",
						"الأسبوع القادم",
						"下周",
					],
				},
			],
			directionPrefixes: {
				past: ["il y a", "vor", "منذ", "ago"],
				future: ["in", "dans", "через", "في غضون"],
			},
			directionPostfixes: {
				past: ["ago", "назад", "前", "以前"],
				future: ["from now", "plus tard", "later", "后", "後", "спустя"],
			},
			unitAliases: {
				hour: [
					"hour",
					"hours",
					"h",
					"heures",
					"heure",
					"часа",
					"часов",
					"ساعة",
					"ساعتين",
					"小时",
				],
				day: [
					"day",
					"days",
					"d",
					"jour",
					"jours",
					"дня",
					"дней",
					"يوم",
					"أيام",
					"天",
					"日",
				],
				week: [
					"week",
					"weeks",
					"semaine",
					"semaines",
					"недели",
					"недель",
					"أسبوع",
					"周",
				],
				minute: [
					"minute",
					"minutes",
					"min",
					"минут",
					"минуты",
					"دقيقة",
					"分钟",
				],
			},
		};

		test("parses non-numeric relative shorthands across 5 languages", () => {
			// English
			expect(parseRelativeTemporal("today", relativeConfig)).toEqual({
				direction: "current",
				amount: 0,
				unit: "day",
			});
			expect(parseRelativeTemporal("yesterday", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
			});
			expect(parseRelativeTemporal("last week", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "week",
			});

			// French
			expect(parseRelativeTemporal("aujourd'hui", relativeConfig)).toEqual({
				direction: "current",
				amount: 0,
				unit: "day",
			});
			expect(parseRelativeTemporal("hier", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
			});
			expect(
				parseRelativeTemporal("la semaine dernière", relativeConfig),
			).toEqual({
				direction: "past",
				amount: 1,
				unit: "week",
			});

			// Russian
			expect(parseRelativeTemporal("сегодня", relativeConfig)).toEqual({
				direction: "current",
				amount: 0,
				unit: "day",
			});
			expect(parseRelativeTemporal("вчера", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
			});
			expect(parseRelativeTemporal("завтра", relativeConfig)).toEqual({
				direction: "future",
				amount: 1,
				unit: "day",
			});

			// Arabic
			expect(parseRelativeTemporal("اليوم", relativeConfig)).toEqual({
				direction: "current",
				amount: 0,
				unit: "day",
			});
			expect(parseRelativeTemporal("أمس", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
			});
			expect(parseRelativeTemporal("غداً", relativeConfig)).toEqual({
				direction: "future",
				amount: 1,
				unit: "day",
			});

			// Chinese
			expect(parseRelativeTemporal("今天", relativeConfig)).toEqual({
				direction: "current",
				amount: 0,
				unit: "day",
			});
			expect(parseRelativeTemporal("昨天", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
			});
			expect(parseRelativeTemporal("上周", relativeConfig)).toEqual({
				direction: "past",
				amount: 1,
				unit: "week",
			});
		});

		test("parses numeric prefix & postfix offsets (e.g. '2 hours ago', 'il y a 2 heures', '3天后')", () => {
			// English postfix: "2 hours ago"
			const enSlot = parseRelativeTemporal("2 hours ago", relativeConfig);
			expect(enSlot).toEqual({
				direction: "past",
				amount: 2,
				unit: "hour",
			});

			// French prefix: "il y a 2 heures"
			const frSlot = parseRelativeTemporal("il y a 2 heures", relativeConfig);
			expect(frSlot).toEqual({
				direction: "past",
				amount: 2,
				unit: "hour",
			});

			// French future prefix: "dans 15 minutes"
			const frFuture = parseRelativeTemporal("dans 15 minutes", relativeConfig);
			expect(frFuture).toEqual({
				direction: "future",
				amount: 15,
				unit: "minute",
			});

			// Russian postfix: "2 часа назад"
			const ruSlot = parseRelativeTemporal("2 часа назад", relativeConfig);
			expect(ruSlot).toEqual({
				direction: "past",
				amount: 2,
				unit: "hour",
			});

			// Chinese postfix: "3天后"
			const zhSlot = parseRelativeTemporal("3天后", relativeConfig);
			expect(zhSlot).toEqual({
				direction: "future",
				amount: 3,
				unit: "day",
			});
		});

		test("evaluates 'two hours ago' relative to current anchor timestamp", () => {
			const slot = parseRelativeTemporal("2 hours ago", relativeConfig);
			expect(slot).toBeDefined();

			const evaluated = evaluateAnchorRelativeTemporal(
				slot!,
				ANCHOR_TIMESTAMP,
				{
					timeZone: "UTC",
				},
			);
			// ANCHOR = 2026-08-17T12:00:00.000Z -> 2 hours ago = 2026-08-17T10:00:00.000Z
			expect(evaluated.startIsoUtc).toBe("2026-08-17T10:00:00.000Z");
			expect(evaluated.endIsoUtc).toBe("2026-08-17T10:00:00.000Z");
			expect(evaluated.isInstantaneous).toBe(true);
		});
	});
});
