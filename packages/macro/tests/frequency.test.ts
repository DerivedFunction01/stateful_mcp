import { describe, expect, test } from "bun:test";
import {
	CADENCE_TYPES,
	type CadenceSchedule,
	formatCadenceSchedule,
	parseCadenceSchedule,
} from "../src";

describe("Universal Frequency & Cadence Engine", () => {
	test("defines CADENCE_TYPES accurately", () => {
		expect(CADENCE_TYPES).toContain("interval");
		expect(CADENCE_TYPES).toContain("recurrence");
		expect(CADENCE_TYPES).toContain("event_anchored");
		expect(CADENCE_TYPES).toContain("continuous");
		expect(CADENCE_TYPES).toContain("one_time");
	});

	describe("1. Interval Parsing", () => {
		test("parses simple integer intervals", () => {
			const res = parseCadenceSchedule("every 4 hours");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({ multiplier: 4, unit: "hour" });
		});

		test("parses intervals in seconds and weeks", () => {
			const secRes = parseCadenceSchedule("every 30 seconds");
			expect(secRes.value?.interval).toEqual({
				multiplier: 30,
				unit: "second",
			});

			const wkRes = parseCadenceSchedule("every 2 weeks");
			expect(wkRes.value?.interval).toEqual({ multiplier: 2, unit: "week" });
		});

		test("parses bounded interval ranges (e.g. every 4-6 hours)", () => {
			const res = parseCadenceSchedule("every 4-6 hours");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({
				multiplier: 4,
				upperMultiplier: 6,
				unit: "hour",
			});
		});

		test("parses interval ranges with 'to'", () => {
			const res = parseCadenceSchedule("every 2 to 3 days");
			expect(res.value?.interval).toEqual({
				multiplier: 2,
				upperMultiplier: 3,
				unit: "day",
			});
		});
	});

	describe("2. Recurrence Parsing", () => {
		test("parses count per period (e.g. 3 times a day)", () => {
			const res = parseCadenceSchedule("3 times a day");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("recurrence");
			expect(res.value?.recurrence).toEqual({ count: 3, period: "day" });
		});

		test("parses word multipliers (once, twice, thrice)", () => {
			const twiceRes = parseCadenceSchedule("twice a week");
			expect(twiceRes.value?.recurrence).toEqual({ count: 2, period: "week" });

			const onceRes = parseCadenceSchedule("once daily");
			expect(onceRes.value?.recurrence).toEqual({ count: 1, period: "day" });

			const thriceRes = parseCadenceSchedule("thrice monthly");
			expect(thriceRes.value?.recurrence).toEqual({
				count: 3,
				period: "month",
			});
		});

		test("parses shorthand multipliers (e.g. 2x/day, 4x per week)", () => {
			const res = parseCadenceSchedule("2x/day");
			expect(res.value?.recurrence).toEqual({ count: 2, period: "day" });
		});
	});

	describe("3. Event Anchored & Relative Offsets", () => {
		test("parses simple event anchors (at bedtime, in the morning)", () => {
			const bedtimeRes = parseCadenceSchedule("at bedtime");
			expect(bedtimeRes.diagnostics).toHaveLength(0);
			expect(bedtimeRes.value?.cadenceType).toBe("event_anchored");
			expect(bedtimeRes.value?.eventAnchor).toBe("before_sleep");

			const morningRes = parseCadenceSchedule("in the morning");
			expect(morningRes.value?.eventAnchor).toBe("waking");
		});

		test("parses domain anchors (at market close, on startup, at midnight)", () => {
			const marketRes = parseCadenceSchedule("at market close");
			expect(marketRes.value?.eventAnchor).toBe("market_close");

			const startRes = parseCadenceSchedule("on startup");
			expect(startRes.value?.eventAnchor).toBe("startup");

			const midRes = parseCadenceSchedule("at midnight");
			expect(midRes.value?.eventAnchor).toBe("midnight");
		});

		test("parses relative offsets to anchors (e.g. 30 min before meals)", () => {
			const res = parseCadenceSchedule("30 min before meals");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("event_anchored");
			expect(res.value?.eventAnchor).toBe("before_meal");
			expect(res.value?.relativeOffset).toEqual({
				direction: "before",
				duration: { magnitude: 30, unit: "minute" },
			});
		});

		test("parses finance offset (e.g. 15 min before market close)", () => {
			const res = parseCadenceSchedule("15 min before market close");
			expect(res.value?.eventAnchor).toBe("market_close");
			expect(res.value?.relativeOffset).toEqual({
				direction: "before",
				duration: { magnitude: 15, unit: "minute" },
			});
		});
	});

	describe("4. Conditional & PRN Triggers", () => {
		test("parses standalone PRN and on-demand triggers", () => {
			const prnRes = parseCadenceSchedule("prn");
			expect(prnRes.value?.isConditional).toBe(true);

			const onDemandRes = parseCadenceSchedule("on demand");
			expect(onDemandRes.value?.isConditional).toBe(true);
		});

		test("parses PRN with attached condition reason", () => {
			const res = parseCadenceSchedule("prn severe pain");
			expect(res.value?.isConditional).toBe(true);
			expect(res.value?.condition).toBe("severe pain");
		});

		test("parses combined interval + PRN with condition", () => {
			const res = parseCadenceSchedule("every 4 hours prn breakthrough pain");
			expect(res.diagnostics).toHaveLength(0);
			expect(res.value?.cadenceType).toBe("interval");
			expect(res.value?.interval).toEqual({ multiplier: 4, unit: "hour" });
			expect(res.value?.isConditional).toBe(true);
			expect(res.value?.condition).toBe("breakthrough pain");
		});
	});

	describe("5. Standard Shorthand Aliases", () => {
		test("parses clinical Latin shorthands (BID, TID, QID, Q4H, QHS)", () => {
			expect(parseCadenceSchedule("BID").value?.recurrence).toEqual({
				count: 2,
				period: "day",
			});
			expect(parseCadenceSchedule("TID").value?.recurrence).toEqual({
				count: 3,
				period: "day",
			});
			expect(parseCadenceSchedule("QID").value?.recurrence).toEqual({
				count: 4,
				period: "day",
			});
			expect(parseCadenceSchedule("Q4H").value?.interval).toEqual({
				multiplier: 4,
				unit: "hour",
			});
			expect(parseCadenceSchedule("QHS").value?.eventAnchor).toBe(
				"before_sleep",
			);
			expect(parseCadenceSchedule("QAM").value?.eventAnchor).toBe("waking");
		});

		test("parses continuous and stat", () => {
			expect(parseCadenceSchedule("continuous").value?.cadenceType).toBe(
				"continuous",
			);
			expect(parseCadenceSchedule("stat").value?.cadenceType).toBe("one_time");
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
				{},
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
				{},
				{
					allowedAnchors: ["waking", "before_sleep"],
				},
			);
			expect(res.diagnostics.length).toBeGreaterThan(0);
			expect(res.diagnostics[0]?.code).toBe("invalid_event_anchor");
			expect(res.value).toBeUndefined();
		});

		test("emits diagnostic when conditional is disallowed by policy", () => {
			const res = parseCadenceSchedule(
				"every 4 hours prn",
				{},
				{ allowConditional: false },
			);
			expect(res.diagnostics.length).toBeGreaterThan(0);
			expect(res.diagnostics[0]?.code).toBe("conditional_not_allowed");
		});
	});

	describe("7. Multi-Lingual Support", () => {
		test("parses Spanish schedules", () => {
			const res = parseCadenceSchedule("cada 8 horas");
			expect(res.value?.interval).toEqual({ multiplier: 8, unit: "hour" });

			const bedRes = parseCadenceSchedule("antes de dormir");
			expect(bedRes.value?.eventAnchor).toBe("before_sleep");
		});

		test("parses German schedules", () => {
			const res = parseCadenceSchedule("alle 2 wochen");
			expect(res.value?.interval).toEqual({ multiplier: 2, unit: "week" });
		});

		test("parses Japanese and Chinese schedules", () => {
			const jpRes = parseCadenceSchedule("每4時間");
			expect(jpRes.value?.interval).toEqual({ multiplier: 4, unit: "hour" });

			const cnRes = parseCadenceSchedule("就寝前");
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
});
