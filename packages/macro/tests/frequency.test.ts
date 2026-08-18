import { describe, expect, test } from "bun:test";
import {
	CADENCE_TYPES,
	type CadenceSchedule,
	type FrequencyGrammarConfig,
	formatCadenceSchedule,
	parseCadenceSchedule,
} from "../src";

// Explicit Test Fixture Configuration (Zero hardcoded defaults in runtime)
function createTestFrequencyConfig(): FrequencyGrammarConfig {
	return {
		timeUnitAliases: {
			second: [
				"s",
				"sec",
				"secs",
				"second",
				"seconds",
				"segundo",
				"segundos",
				"sekunde",
				"sekunden",
				"秒",
			],
			minute: [
				"min",
				"mins",
				"minute",
				"minutes",
				"minuto",
				"minutos",
				"分",
				"minuten",
			],
			hour: [
				"h",
				"hr",
				"hrs",
				"hour",
				"hours",
				"hora",
				"horas",
				"stunde",
				"stunden",
				"std",
				"時",
				"小时",
				"時間",
			],
			day: [
				"d",
				"day",
				"days",
				"daily",
				"dia",
				"dias",
				"diario",
				"tag",
				"tage",
				"täglich",
				"日",
				"天",
			],
			week: [
				"w",
				"wk",
				"wks",
				"week",
				"weeks",
				"weekly",
				"semana",
				"semanas",
				"semanal",
				"woche",
				"wochen",
				"wöchentlich",
				"週",
				"周",
			],
			month: [
				"mo",
				"mos",
				"month",
				"months",
				"monthly",
				"mes",
				"meses",
				"mensual",
				"monat",
				"monate",
				"monatlich",
				"月",
			],
			quarter: [
				"q",
				"quarter",
				"quarters",
				"quarterly",
				"trimestre",
				"quartal",
				"quartale",
				"vierteljährlich",
				"季度",
			],
			year: [
				"y",
				"yr",
				"yrs",
				"year",
				"years",
				"yearly",
				"annual",
				"annually",
				"año",
				"años",
				"anual",
				"jahr",
				"jahre",
				"jährlich",
				"年",
			],
		},
		multiplierAliases: {
			"1": ["once", "1x", "single", "una vez", "einmal", "1回", "1次"],
			"2": ["twice", "2x", "double", "dos veces", "zweimal", "2回", "2次"],
			"3": [
				"thrice",
				"3x",
				"triple",
				"three times",
				"tres veces",
				"dreimal",
				"3回",
				"3次",
			],
			"4": ["4x", "four times", "cuatro veces", "viermal", "4回", "4次"],
			"5": ["5x", "five times", "cinco veces", "fünfmal", "5回", "5次"],
		},
		frequencyAliases: {
			daily: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "day" },
			},
			qd: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "day" },
			},
			"q.d.": {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "day" },
			},
			bid: {
				cadenceType: "recurrence",
				recurrence: { count: 2, period: "day" },
			},
			"b.i.d.": {
				cadenceType: "recurrence",
				recurrence: { count: 2, period: "day" },
			},
			tid: {
				cadenceType: "recurrence",
				recurrence: { count: 3, period: "day" },
			},
			"t.i.d.": {
				cadenceType: "recurrence",
				recurrence: { count: 3, period: "day" },
			},
			qid: {
				cadenceType: "recurrence",
				recurrence: { count: 4, period: "day" },
			},
			"q.i.d.": {
				cadenceType: "recurrence",
				recurrence: { count: 4, period: "day" },
			},
			weekly: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "week" },
			},
			qw: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "week" },
			},
			monthly: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "month" },
			},
			qm: {
				cadenceType: "recurrence",
				recurrence: { count: 1, period: "month" },
			},
			q2h: {
				cadenceType: "interval",
				interval: { multiplier: 2, unit: "hour" },
			},
			q4h: {
				cadenceType: "interval",
				interval: { multiplier: 4, unit: "hour" },
			},
			q6h: {
				cadenceType: "interval",
				interval: { multiplier: 6, unit: "hour" },
			},
			q8h: {
				cadenceType: "interval",
				interval: { multiplier: 8, unit: "hour" },
			},
			q12h: {
				cadenceType: "interval",
				interval: { multiplier: 12, unit: "hour" },
			},
			qhs: { cadenceType: "event_anchored", eventAnchor: "before_sleep" },
			"q.h.s.": { cadenceType: "event_anchored", eventAnchor: "before_sleep" },
			qam: { cadenceType: "event_anchored", eventAnchor: "waking" },
			"q.a.m.": { cadenceType: "event_anchored", eventAnchor: "waking" },
			continuous: { cadenceType: "continuous" },
			stat: { cadenceType: "one_time" },
			prn: { cadenceType: "one_time", isConditional: true },
			"p.r.n.": { cadenceType: "one_time", isConditional: true },
		},
		eventAnchorAliases: {
			before_sleep: [
				"at bedtime",
				"before bedtime",
				"before sleep",
				"bedtime",
				"antes de dormir",
				"vor dem schlafen",
				"就寝前",
				"睡前",
			],
			waking: [
				"in the morning",
				"upon waking",
				"on waking",
				"al despertar",
				"beim aufwachen",
				"起床時",
				"晨起",
			],
			before_meal: [
				"before meals",
				"before meal",
				"before food",
				"preprandial",
				"ac",
				"a.c.",
				"antes de las comidas",
				"vor den mahlzeiten",
				"食前",
			],
			with_meal: [
				"with meals",
				"with meal",
				"with food",
				"during meals",
				"con las comidas",
				"zu den mahlzeiten",
				"食中",
				"随餐",
			],
			after_meal: [
				"after meals",
				"after meal",
				"after food",
				"postprandial",
				"pc",
				"p.c.",
				"después de las comidas",
				"nach den mahlzeiten",
				"食後",
			],
			market_open: [
				"market open",
				"at market open",
				"market opening",
				"apertura del mercado",
				"开盘",
			],
			market_close: [
				"market close",
				"at market close",
				"market closing",
				"cierre del mercado",
				"收盘",
			],
			midnight: [
				"at midnight",
				"midnight",
				"a medianoche",
				"mitternacht",
				"午夜",
			],
			startup: ["on startup", "at startup", "startup", "al inicio", "启动时"],
			shutdown: [
				"on shutdown",
				"at shutdown",
				"shutdown",
				"al apagado",
				"关机时",
			],
		},
		conditionalAliases: [
			"prn",
			"p.r.n.",
			"as needed",
			"as-needed",
			"on demand",
			"on-demand",
			"según sea necesario",
			"nach bedarf",
			"必要時",
			"按需",
		],
		conditionConnectors: [
			"for",
			"due to",
			"on",
			"with",
			"para",
			"por",
			"bei",
			"bei bedarf an",
		],
		intervalPrefixes: [
			"every",
			"cada",
			"alle",
			"jede",
			"jeder",
			"jedes",
			"每",
			"q",
		],
		recurrenceConnectors: [
			"times a",
			"times per",
			"time a",
			"time per",
			"x a",
			"x per",
			"x/",
			"veces al",
			"veces por",
			"mal pro",
			"回/",
			"次/",
			"per",
			"a",
			"por",
			"pro",
			"/",
		],
		rangeDelimiters: ["to", "until", "a", "bis", "-", "–", "至", "到"],
		relativeOffsetConnectors: {
			before: ["before", "prior to", "antes de", "vor", "前"],
			after: ["after", "post", "después de", "nach", "後", "后"],
			at: ["at", "on", "in the", "a", "um", "bei", "在", "于"],
			with: ["with", "during", "con", "mit", "zu", "随"],
		},
	};
}

describe("Universal Frequency & Cadence Engine", () => {
	const testConfig = createTestFrequencyConfig();

	test("defines CADENCE_TYPES accurately", () => {
		expect(CADENCE_TYPES).toContain("interval");
		expect(CADENCE_TYPES).toContain("recurrence");
		expect(CADENCE_TYPES).toContain("event_anchored");
		expect(CADENCE_TYPES).toContain("continuous");
		expect(CADENCE_TYPES).toContain("one_time");
	});

	describe("1. Interval Parsing", () => {
		test("parses simple integer intervals", () => {
			const res = parseCadenceSchedule("every 4 hours", testConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({ multiplier: 4, unit: "hour" });
		});

		test("parses intervals in seconds and weeks", () => {
			const secRes = parseCadenceSchedule("every 30 seconds", testConfig);
			expect(secRes.value?.interval).toEqual({
				multiplier: 30,
				unit: "second",
			});

			const wkRes = parseCadenceSchedule("every 2 weeks", testConfig);
			expect(wkRes.value?.interval).toEqual({ multiplier: 2, unit: "week" });
		});

		test("parses bounded interval ranges (e.g. every 4-6 hours)", () => {
			const res = parseCadenceSchedule("every 4-6 hours", testConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({
				multiplier: 4,
				upperMultiplier: 6,
				unit: "hour",
			});
		});

		test("parses interval ranges with 'to'", () => {
			const res = parseCadenceSchedule("every 2 to 3 days", testConfig);
			expect(res.value?.interval).toEqual({
				multiplier: 2,
				upperMultiplier: 3,
				unit: "day",
			});
		});
	});

	describe("2. Recurrence Parsing", () => {
		test("parses count per period (e.g. 3 times a day)", () => {
			const res = parseCadenceSchedule("3 times a day", testConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("recurrence");
			expect(res.value?.recurrence).toEqual({ count: 3, period: "day" });
		});

		test("parses word multipliers (once, twice, thrice)", () => {
			const twiceRes = parseCadenceSchedule("twice a week", testConfig);
			expect(twiceRes.value?.recurrence).toEqual({ count: 2, period: "week" });

			const onceRes = parseCadenceSchedule("once daily", testConfig);
			expect(onceRes.value?.recurrence).toEqual({ count: 1, period: "day" });

			const thriceRes = parseCadenceSchedule("thrice monthly", testConfig);
			expect(thriceRes.value?.recurrence).toEqual({
				count: 3,
				period: "month",
			});
		});

		test("parses shorthand multipliers (e.g. 2x/day, 4x per week)", () => {
			const res = parseCadenceSchedule("2x/day", testConfig);
			expect(res.value?.recurrence).toEqual({ count: 2, period: "day" });
		});
	});

	describe("3. Event Anchored & Relative Offsets", () => {
		test("parses simple event anchors (at bedtime, in the morning)", () => {
			const bedtimeRes = parseCadenceSchedule("at bedtime", testConfig);
			expect(bedtimeRes.diagnostics).toHaveLength(0);
			expect(bedtimeRes.value?.cadenceType).toBe("event_anchored");
			expect(bedtimeRes.value?.eventAnchor).toBe("before_sleep");

			const morningRes = parseCadenceSchedule("in the morning", testConfig);
			expect(morningRes.value?.eventAnchor).toBe("waking");
		});

		test("parses domain anchors (at market close, on startup, at midnight)", () => {
			const marketRes = parseCadenceSchedule("at market close", testConfig);
			expect(marketRes.value?.eventAnchor).toBe("market_close");

			const startRes = parseCadenceSchedule("on startup", testConfig);
			expect(startRes.value?.eventAnchor).toBe("startup");

			const midRes = parseCadenceSchedule("at midnight", testConfig);
			expect(midRes.value?.eventAnchor).toBe("midnight");
		});

		test("parses relative offsets to anchors (e.g. 30 min before meals)", () => {
			const res = parseCadenceSchedule("30 min before meals", testConfig);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("event_anchored");
			expect(res.value?.eventAnchor).toBe("before_meal");
			expect(res.value?.relativeOffset).toEqual({
				direction: "before",
				duration: { magnitude: 30, unit: "minute" },
			});
		});

		test("parses finance offset (e.g. 15 min before market close)", () => {
			const res = parseCadenceSchedule(
				"15 min before market close",
				testConfig,
			);
			expect(res.value?.eventAnchor).toBe("market_close");
			expect(res.value?.relativeOffset).toEqual({
				direction: "before",
				duration: { magnitude: 15, unit: "minute" },
			});
		});
	});

	describe("4. Conditional & PRN Triggers", () => {
		test("parses standalone PRN and on-demand triggers", () => {
			const prnRes = parseCadenceSchedule("prn", testConfig);
			expect(prnRes.value?.isConditional).toBe(true);

			const onDemandRes = parseCadenceSchedule("on demand", testConfig);
			expect(onDemandRes.value?.isConditional).toBe(true);
		});

		test("parses PRN with attached condition reason", () => {
			const res = parseCadenceSchedule("prn severe pain", testConfig);
			expect(res.value?.isConditional).toBe(true);
			expect(res.value?.condition).toBe("severe pain");
		});

		test("parses combined interval + PRN with condition", () => {
			const res = parseCadenceSchedule(
				"every 4 hours prn breakthrough pain",
				testConfig,
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({ multiplier: 4, unit: "hour" });
			expect(res.value?.isConditional).toBe(true);
			expect(res.value?.condition).toBe("breakthrough pain");
		});
	});

	describe("5. Standard Shorthand Aliases", () => {
		test("parses clinical Latin shorthands (BID, TID, QID, Q4H, QHS)", () => {
			expect(parseCadenceSchedule("BID", testConfig).value?.recurrence).toEqual(
				{
					count: 2,
					period: "day",
				},
			);
			expect(parseCadenceSchedule("TID", testConfig).value?.recurrence).toEqual(
				{
					count: 3,
					period: "day",
				},
			);
			expect(parseCadenceSchedule("QID", testConfig).value?.recurrence).toEqual(
				{
					count: 4,
					period: "day",
				},
			);
			expect(parseCadenceSchedule("Q4H", testConfig).value?.interval).toEqual({
				multiplier: 4,
				unit: "hour",
			});
			expect(parseCadenceSchedule("QHS", testConfig).value?.eventAnchor).toBe(
				"before_sleep",
			);
			expect(parseCadenceSchedule("QAM", testConfig).value?.eventAnchor).toBe(
				"waking",
			);
		});

		test("parses continuous and stat", () => {
			expect(
				parseCadenceSchedule("continuous", testConfig).value?.cadenceType,
			).toBe("continuous");
			expect(parseCadenceSchedule("stat", testConfig).value?.cadenceType).toBe(
				"one_time",
			);
		});
	});

	describe("6. Generic Enum Specialization & Policy Constraints", () => {
		type ClinicalAnchor =
			| "waking"
			| "before_meal"
			| "with_meal"
			| "after_meal"
			| "before_sleep";
		type ClinicalUnit = "minute" | "hour" | "day" | "week" | "month";

		test("accepts valid clinical enums under policy", () => {
			const res = parseCadenceSchedule<ClinicalAnchor, ClinicalUnit>(
				"at bedtime",
				testConfig as any,
				{
					allowedAnchors: [
						"waking",
						"before_meal",
						"with_meal",
						"after_meal",
						"before_sleep",
					],
				},
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.eventAnchor).toBe("before_sleep");
		});

		test("emits diagnostic when out-of-domain anchor is supplied", () => {
			const res = parseCadenceSchedule<ClinicalAnchor, ClinicalUnit>(
				"at market close",
				testConfig as any,
				{
					allowedAnchors: ["waking", "before_sleep"],
				},
			);
			expect(res.diagnostics.length).toBeGreaterThan(0);
			expect(res.diagnostics[0]?.code).toBe("invalid_event_anchor");
			expect(res.value).toBeUndefined();
		});

		test("emits diagnostic when conditional is disallowed by policy", () => {
			const res = parseCadenceSchedule("every 4 hours prn", testConfig, {
				allowConditional: false,
			});
			expect(res.diagnostics.length).toBeGreaterThan(0);
			expect(res.diagnostics[0]?.code).toBe("conditional_not_allowed");
		});
	});

	describe("7. Multi-Lingual Support", () => {
		test("parses Spanish schedules", () => {
			const res = parseCadenceSchedule("cada 8 horas", testConfig);
			expect(res.value?.interval).toEqual({ multiplier: 8, unit: "hour" });

			const bedRes = parseCadenceSchedule("antes de dormir", testConfig);
			expect(bedRes.value?.eventAnchor).toBe("before_sleep");
		});

		test("parses German schedules", () => {
			const res = parseCadenceSchedule("alle 2 wochen", testConfig);
			expect(res.value?.interval).toEqual({ multiplier: 2, unit: "week" });
		});

		test("parses Japanese and Chinese schedules", () => {
			const jpRes = parseCadenceSchedule("每4時間", testConfig);
			expect(jpRes.value?.interval).toEqual({ multiplier: 4, unit: "hour" });

			const cnRes = parseCadenceSchedule("就寝前", testConfig);
			expect(cnRes.value?.eventAnchor).toBe("before_sleep");
		});
	});

	describe("8. Formatting & Roundtrip", () => {
		test("formats interval schedules", () => {
			const schedule: CadenceSchedule = {
				cadenceType: "interval",
				interval: { multiplier: 4, unit: "hour" },
			};
			expect(formatCadenceSchedule(schedule)).toBe("every 4 hours");
		});

		test("formats interval range schedules with condition", () => {
			const schedule: CadenceSchedule = {
				cadenceType: "interval",
				interval: { multiplier: 4, upperMultiplier: 6, unit: "hour" },
				isConditional: true,
				condition: "breakthrough pain",
			};
			expect(formatCadenceSchedule(schedule)).toBe(
				"every 4-6 hours as needed for breakthrough pain",
			);
		});

		test("formats recurrence schedules", () => {
			const schedule: CadenceSchedule = {
				cadenceType: "recurrence",
				recurrence: { count: 3, period: "day" },
			};
			expect(formatCadenceSchedule(schedule)).toBe("3 times a day");
		});

		test("formats event-anchored with offset", () => {
			const schedule: CadenceSchedule = {
				cadenceType: "event_anchored",
				eventAnchor: "before_meal",
				relativeOffset: {
					direction: "before",
					duration: { magnitude: 30, unit: "minute" },
				},
			};
			expect(formatCadenceSchedule(schedule)).toBe(
				"30 minutes before before meal",
			);
		});
	});

	describe("9. Adversarial Zero-Hardcoding Invariant Tests", () => {
		test("fails to parse arbitrary English when config is empty ({})", () => {
			// Zero configuration supplied
			const emptyRes1 = parseCadenceSchedule("every 4 hours", {});
			expect(emptyRes1.diagnostics).toHaveLength(1);
			expect(emptyRes1.diagnostics[0]?.code).toBe("unrecognized_cadence");
			expect(emptyRes1.value).toBeUndefined();

			const emptyRes2 = parseCadenceSchedule("BID", {});
			expect(emptyRes2.diagnostics).toHaveLength(1);
			expect(emptyRes2.value).toBeUndefined();

			const emptyRes3 = parseCadenceSchedule("at bedtime", {});
			expect(emptyRes3.diagnostics).toHaveLength(1);
			expect(emptyRes3.value).toBeUndefined();

			const emptyRes4 = parseCadenceSchedule("prn pain", {});
			expect(emptyRes4.diagnostics).toHaveLength(1);
			expect(emptyRes4.value).toBeUndefined();
		});

		test("parses custom bespoke game DSL and strictly ignores English", () => {
			const gameDslConfig: FrequencyGrammarConfig = {
				intervalPrefixes: ["cooldown:", "cd:"],
				timeUnitAliases: {
					tick: ["ticks", "t", "ciclo"],
					turn: ["turns", "ronda"],
				},
				conditionalAliases: ["when-buffed", "on-frenzy"],
				conditionConnectors: ["with", "con"],
			};

			// Matches custom DSL
			const res = parseCadenceSchedule(
				"cooldown: 50 ticks when-buffed with berserk",
				gameDslConfig,
			);
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({ multiplier: 50, unit: "tick" });
			expect(res.value?.isConditional).toBe(true);
			expect(res.value?.condition).toBe("berserk");

			// English is NOT recognized under custom DSL
			const englishUnderGameDsl = parseCadenceSchedule(
				"every 4 hours prn pain",
				gameDslConfig,
			);
			expect(englishUnderGameDsl.diagnostics).toHaveLength(1);
			expect(englishUnderGameDsl.diagnostics[0]?.code).toBe(
				"unrecognized_cadence",
			);
		});
	});
});
