import { describe, expect, test } from "bun:test";
import {
	buildAdaptiveBoundary,
	buildDatePatternString,
	compileDateRegex,
	deriveDateTimeFormats,
	formatDateTimeConfigToString,
	formatDateTimeValue,
	generateDefaultMonthAliases,
	generateTimeZoneCodeMap,
	getTimeZoneIsoOffset,
	isValidTimeZone,
	joinFormatList,
	parseDateTimeStringToConfig,
	resolveTimeZone,
	resolveTwoDigitYear,
	splitFormatList,
} from "../src";

describe("dynamic timezone and date-time utilities", () => {
	test("generateTimeZoneCodeMap discovers standard timezone short codes dynamically", () => {
		const fullMap = generateTimeZoneCodeMap();
		expect(Object.keys(fullMap).length).toBeGreaterThan(0);
		expect(fullMap.UTC || fullMap.Z || fullMap.GMT).toBeDefined();

		const blankMap = generateTimeZoneCodeMap({ blank: true });
		expect(blankMap).toEqual({});
	}, 15000);

	test("isValidTimeZone validates IANA timezones correctly", () => {
		expect(isValidTimeZone("UTC")).toBe(true);
		expect(isValidTimeZone("America/New_York")).toBe(true);
		expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
		expect(isValidTimeZone("Invalid/Fake_Zone")).toBe(false);
	});

	test("resolveTimeZone resolves codes, IANA identifiers, and fallbacks", () => {
		const customMap = {
			EST: "America/New_York",
			PST: "America/Los_Angeles",
			HQ: "Europe/London",
		};

		expect(resolveTimeZone("EST", customMap)).toBe("America/New_York");
		expect(resolveTimeZone("est", customMap)).toBe("America/New_York");
		expect(resolveTimeZone("HQ", customMap)).toBe("Europe/London");
		expect(resolveTimeZone("Asia/Tokyo", customMap)).toBe("Asia/Tokyo");

		const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		expect(resolveTimeZone("", customMap)).toBe(defaultZone);
		expect(resolveTimeZone(undefined, customMap)).toBe(defaultZone);
	});

	test("getTimeZoneIsoOffset calculates ISO offsets dynamically", () => {
		expect(getTimeZoneIsoOffset("UTC")).toBe("+00:00");
		const offset = getTimeZoneIsoOffset("America/New_York");
		expect(offset).toMatch(/^[-+]\d{2}:\d{2}$/);
	});

	test("parseDateTimeStringToConfig and formatDateTimeConfigToString round-trip", () => {
		const formatStr = "MM/DD/YYYY";
		const config = parseDateTimeStringToConfig(formatStr);
		expect(config.tokens).toEqual(["MM", "DD", "YYYY"]);
		expect(config.separators).toEqual(["", "/", "/", ""]);
		expect(formatDateTimeConfigToString(config)).toBe(formatStr);

		const julianStr = "YYDDD";
		const julianConfig = parseDateTimeStringToConfig(julianStr);
		expect(julianConfig.tokens).toEqual(["YY", "DDD"]);
		expect(julianConfig.separators).toEqual(["", "", ""]);
		expect(formatDateTimeConfigToString(julianConfig)).toBe(julianStr);

		const cjkStr = "YYYY年MM月DD日";
		const cjkConfig = parseDateTimeStringToConfig(cjkStr);
		expect(cjkConfig.tokens).toEqual(["YYYY", "MM", "DD"]);
		expect(formatDateTimeConfigToString(cjkConfig)).toBe(cjkStr);
	});

	test("resolveTwoDigitYear derives centuries dynamically from current year", () => {
		const currentCentury = Math.floor(new Date().getFullYear() / 100) * 100;
		expect(resolveTwoDigitYear(26)).toBe(currentCentury + 26);
	});

	test("deriveDateTimeFormats generates combinatorial datetime candidates", () => {
		const dates = ["YYYY-MM-DD", "MM_name DD, YYYY"];
		const times = ["HH:min", "HH:min:SS ampm"];

		const derived = deriveDateTimeFormats(dates, times, {
			order: "date-first",
			separators: [" ", " at "],
		});

		expect(derived).toContain("YYYY-MM-DD HH:min");
		expect(derived).toContain("YYYY-MM-DD at HH:min");
		expect(derived).toContain("MM_name DD, YYYY at HH:min:SS ampm");

		// Time-first with disabled combinations
		const timeFirst = deriveDateTimeFormats(["YYYY-MM-DD"], ["HH:min"], {
			order: "time-first",
			separators: [" "],
			disabledCombinations: ["HH:min YYYY-MM-DD"],
		});
		expect(timeFirst).toHaveLength(0);
	});

	test("buildAdaptiveBoundary protects against partial matches in IPs and paths", () => {
		const slashBound = buildAdaptiveBoundary(["/"]);
		expect(slashBound.start).toContain("/");
		expect(slashBound.end).toContain("/");

		const dotBound = buildAdaptiveBoundary(["."]);
		expect(dotBound.start).toContain(".");

		// Test regex with slash boundary
		const patternResult = buildDatePatternString(
			["MM", "DD", "YYYY"],
			["/", "/"],
		);
		const regex = compileDateRegex(patternResult.pattern);

		expect(regex.test("08/17/2026")).toBe(true);
		expect(regex.test("path/08/17/2026/file")).toBe(false);
	});

	test("formatDateTimeValue gracefully collapses missing fields", () => {
		const fullFormat = parseDateTimeStringToConfig("MM_name DD, YYYY");
		// Missing day
		const formattedNoDay = formatDateTimeValue(
			{ year: 2026, month: 8 },
			fullFormat,
		);
		expect(formattedNoDay).toBe("August 2026");

		// Time only with missing seconds
		const timeFormat = parseDateTimeStringToConfig("HH:min:SS ampm");
		const formattedNoSec = formatDateTimeValue(
			{ hour: 14, minute: 30 },
			timeFormat,
		);
		expect(formattedNoSec).toBe("14:30 PM");
	});

	test("generateDefaultMonthAliases produces 12 months of localized aliases", () => {
		const aliases = generateDefaultMonthAliases(["en-US"]);
		expect(aliases).toHaveLength(12);
		expect(aliases[0]).toContain("january");
		expect(aliases[0]).toContain("jan");
		expect(aliases[7]).toContain("august");
		expect(aliases[7]).toContain("aug");
	});

	test("splitFormatList and joinFormatList handle user delimiters without hardcoded fallbacks", () => {
		const raw = "YYYY-MM-DD || MM/DD/YYYY || MM_name DD, YYYY";
		const split = splitFormatList(raw, "||");
		expect(split).toEqual(["YYYY-MM-DD", "MM/DD/YYYY", "MM_name DD, YYYY"]);

		const joined = joinFormatList(split, " || ");
		expect(joined).toBe(raw);

		// Without delimiter, preserves single template
		expect(splitFormatList("MM_name DD, YYYY")).toEqual(["MM_name DD, YYYY"]);
	});

	test("deriveDateTimeFormats supports order: both", () => {
		const derived = deriveDateTimeFormats(["YYYY-MM-DD"], ["HH:min"], {
			order: "both",
			separators: [" "],
		});
		expect(derived).toContain("YYYY-MM-DD HH:min");
		expect(derived).toContain("HH:min YYYY-MM-DD");
	});
});
