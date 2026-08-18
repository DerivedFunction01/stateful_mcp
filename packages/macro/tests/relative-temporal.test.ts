import { describe, expect, it } from "bun:test";
import {
	evaluateAnchorRelativeTemporal,
	parseRelativeTemporal,
	type RelativeTemporalConfig,
} from "../src/values/date-time";

describe("User-Defined Relative & Retrospective/Prospective Date Grammar", () => {
	const userConfig: RelativeTemporalConfig = {
		locales: "en",
		temporalModifiers: {
			previous: ["last", "past", "上", "上一", "上个"],
			next: ["next", "下", "下一", "下个"],
			current: ["this", "本", "今", "这个"],
		},
		monthAliases: {
			"1": ["january", "jan", "一月"],
			"5": ["may", "五月"],
			"8": ["august", "aug", "八月"],
			"12": ["december", "dec", "十二月"],
		},
		weekdayAliases: {
			"0": ["sunday", "sun", "周日", "星期日"],
			"1": ["monday", "mon", "周一", "星期一"],
			"3": ["wednesday", "wed", "周三", "星期三"],
			"5": ["friday", "fri", "周五", "星期五"],
		},
		unitAliases: {
			day: ["day", "days", "d", "天", "日"],
			week: ["week", "weeks", "wk", "周", "星期"],
			month: ["month", "months", "mo", "月"],
			year: ["year", "years", "yr", "年"],
			hour: ["hour", "hours", "h", "hr", "小时"],
		},
		directionPrefixes: {
			past: ["il y a", "vor", "hace"],
			future: ["in", "dans", "en"],
		},
		directionPostfixes: {
			past: ["ago", "назад", "前"],
			future: ["from now", "plus tard", "后", "後"],
		},
		relativeTemporalAliases: {
			yesterday: ["yesterday", "hier", "gestern", "昨天"],
			today: ["today", "aujourd'hui", "heute", "今天"],
			tomorrow: ["tomorrow", "demain", "morgen", "明天"],
			anteayer: ["anteayer", "vorgestern", "前天"],
		},
	};

	describe("1. Modifier + Target Composition Parsing", () => {
		it("parses 'last December' with user-defined modifier and month aliases", () => {
			const parsed = parseRelativeTemporal("last December", userConfig);
			expect(parsed).toEqual({
				direction: "past",
				amount: 1,
				unit: "month",
				specificQualifier: "12",
			});
		});

		it("parses '上个月' (last month in Chinese) deterministically", () => {
			const parsed = parseRelativeTemporal("上个月", userConfig);
			expect(parsed).toEqual({
				direction: "past",
				amount: 1,
				unit: "month",
			});
		});

		it("parses 'next Friday' with user-defined weekday aliases", () => {
			const parsed = parseRelativeTemporal("next Friday", userConfig);
			expect(parsed).toEqual({
				direction: "future",
				amount: 1,
				unit: "day",
				specificQualifier: "weekday_5",
			});
		});

		it("parses 'this week' into current week window", () => {
			const parsed = parseRelativeTemporal("this week", userConfig);
			expect(parsed).toEqual({
				direction: "current",
				amount: 1,
				unit: "week",
			});
		});
	});

	describe("2. Direction Affixes & Direct Aliases Parsing", () => {
		it("parses postfix offset '3 days ago'", () => {
			const parsed = parseRelativeTemporal("3 days ago", userConfig);
			expect(parsed).toEqual({
				direction: "past",
				amount: 3,
				unit: "day",
			});
		});

		it("parses Chinese postfix offset '3天前'", () => {
			const parsed = parseRelativeTemporal("3天前", userConfig);
			expect(parsed).toEqual({
				direction: "past",
				amount: 3,
				unit: "day",
			});
		});

		it("parses prefix offset 'in 2 hours'", () => {
			const parsed = parseRelativeTemporal("in 2 hours", userConfig);
			expect(parsed).toEqual({
				direction: "future",
				amount: 2,
				unit: "hour",
			});
		});

		it("parses Spanish prefix offset 'hace 3 days'", () => {
			const parsed = parseRelativeTemporal("hace 3 days", userConfig);
			expect(parsed).toEqual({
				direction: "past",
				amount: 3,
				unit: "day",
			});
		});

		it("parses Tier 1 direct alias 'anteayer' (-2 days)", () => {
			const parsed = parseRelativeTemporal("anteayer", userConfig);
			expect(parsed).toBeDefined();
			expect(parsed?.specificQualifier).toBe("anteayer");
		});
	});

	describe("3. Anchor-Relative Window Evaluation", () => {
		// Reference anchor: Wednesday, Aug 19, 2026 14:00 UTC
		const anchorTimestamp = "2026-08-19T14:00:00.000Z";

		it("evaluates 'last December' from August 2026 to 2025-12-01 - 2025-12-31", () => {
			const slot = parseRelativeTemporal("last December", userConfig)!;
			const window = evaluateAnchorRelativeTemporal(slot, anchorTimestamp, {
				timeZone: "UTC",
			});

			expect(window.startIsoUtc).toBe("2025-12-01T00:00:00.000Z");
			expect(window.endIsoUtc).toBe("2025-12-31T23:59:59.999Z");
			expect(window.isInstantaneous).toBe(false);
		});

		it("evaluates 'next Friday' (upcoming) from Wednesday Aug 19 to Friday Aug 21, 2026", () => {
			const slot = parseRelativeTemporal("next Friday", userConfig)!;
			const window = evaluateAnchorRelativeTemporal(slot, anchorTimestamp, {
				timeZone: "UTC",
				disambiguationPolicy: { nextWeekdayPolicy: "upcoming" },
			});

			expect(window.startIsoUtc).toBe("2026-08-21T00:00:00.000Z");
			expect(window.endIsoUtc).toBe("2026-08-21T23:59:59.999Z");
		});

		it("evaluates 'next Friday' with following_week policy to Friday Aug 28, 2026", () => {
			const slot = parseRelativeTemporal("next Friday", userConfig)!;
			const window = evaluateAnchorRelativeTemporal(slot, anchorTimestamp, {
				timeZone: "UTC",
				disambiguationPolicy: { nextWeekdayPolicy: "following_week" },
			});

			expect(window.startIsoUtc).toBe("2026-08-28T00:00:00.000Z");
			expect(window.endIsoUtc).toBe("2026-08-28T23:59:59.999Z");
		});

		it("evaluates 'last Sunday' from Wednesday Aug 19 to Sunday Aug 16, 2026", () => {
			const slot = parseRelativeTemporal("last Sunday", userConfig)!;
			const window = evaluateAnchorRelativeTemporal(slot, anchorTimestamp, {
				timeZone: "UTC",
			});

			expect(window.startIsoUtc).toBe("2026-08-16T00:00:00.000Z");
			expect(window.endIsoUtc).toBe("2026-08-16T23:59:59.999Z");
		});

		it("evaluates instantaneous offset '3 days ago' to 2026-08-16T14:00:00.000Z", () => {
			const slot = parseRelativeTemporal("3 days ago", userConfig)!;
			const window = evaluateAnchorRelativeTemporal(slot, anchorTimestamp, {
				timeZone: "UTC",
			});

			expect(window.startIsoUtc).toBe("2026-08-16T14:00:00.000Z");
			expect(window.endIsoUtc).toBe("2026-08-16T14:00:00.000Z");
			expect(window.isInstantaneous).toBe(true);
		});
	});

	describe("4. Adversarial & Inversion Tests (Guards Against Hardcoded English)", () => {
		it("strictly obeys inverted modifiers ('next' means past, 'last' means future)", () => {
			const invertedModifierConfig: RelativeTemporalConfig = {
				temporalModifiers: {
					previous: ["next"], // adversarial inversion: "next" means previous
					next: ["last"], // adversarial inversion: "last" means next
				},
				monthAliases: {
					"12": ["december"],
				},
			};

			const parsedNext = parseRelativeTemporal(
				"next December",
				invertedModifierConfig,
			);
			expect(parsedNext).toEqual({
				direction: "past", // "next" was mapped to previous
				amount: 1,
				unit: "month",
				specificQualifier: "12",
			});

			const parsedLast = parseRelativeTemporal(
				"last December",
				invertedModifierConfig,
			);
			expect(parsedLast).toEqual({
				direction: "future", // "last" was mapped to next
				amount: 1,
				unit: "month",
				specificQualifier: "12",
			});
		});

		it("strictly obeys inverted weekday and month mappings (Friday = Monday, December = May)", () => {
			const invertedEntityConfig: RelativeTemporalConfig = {
				temporalModifiers: {
					previous: ["last"],
					next: ["next"],
				},
				weekdayAliases: {
					"1": ["friday"], // "friday" maps to Monday (index 1)
					"5": ["monday"], // "monday" maps to Friday (index 5)
				},
				monthAliases: {
					"5": ["december"], // "december" maps to May (month 5)
					"12": ["may"], // "may" maps to December (month 12)
				},
			};

			const parsedWeekday = parseRelativeTemporal(
				"last Friday",
				invertedEntityConfig,
			);
			expect(parsedWeekday).toEqual({
				direction: "past",
				amount: 1,
				unit: "day",
				specificQualifier: "weekday_1", // Monday!
			});

			const parsedMonth = parseRelativeTemporal(
				"next December",
				invertedEntityConfig,
			);
			expect(parsedMonth).toEqual({
				direction: "future",
				amount: 1,
				unit: "month",
				specificQualifier: "5", // May!
			});
		});

		it("strictly obeys inverted direction affixes and swapped unit names", () => {
			const invertedAffixConfig: RelativeTemporalConfig = {
				directionPrefixes: {
					past: ["in"], // "in" prefix means past
					future: ["ago"], // "ago" prefix means future
				},
				unitAliases: {
					hour: ["days"], // "days" word maps to hour unit
					day: ["hours"], // "hours" word maps to day unit
				},
			};

			const parsedPrefixPast = parseRelativeTemporal(
				"in 3 days",
				invertedAffixConfig,
			);
			expect(parsedPrefixPast).toEqual({
				direction: "past",
				amount: 3,
				unit: "hour", // resolved to hour, not day!
			});

			const parsedPrefixFuture = parseRelativeTemporal(
				"ago 5 hours",
				invertedAffixConfig,
			);
			expect(parsedPrefixFuture).toEqual({
				direction: "future",
				amount: 5,
				unit: "day", // resolved to day, not hour!
			});
		});

		it("rejects English phrases completely when config is empty (zero hardcoded fallback)", () => {
			const emptyConfig: RelativeTemporalConfig = {};

			expect(parseRelativeTemporal("last December", emptyConfig)).toBeUndefined();
			expect(parseRelativeTemporal("next Friday", emptyConfig)).toBeUndefined();
			expect(parseRelativeTemporal("3 days ago", emptyConfig)).toBeUndefined();
			expect(parseRelativeTemporal("in 2 hours", emptyConfig)).toBeUndefined();
			expect(parseRelativeTemporal("yesterday", emptyConfig)).toBeUndefined();
			expect(parseRelativeTemporal("today", emptyConfig)).toBeUndefined();
		});
	});
});
