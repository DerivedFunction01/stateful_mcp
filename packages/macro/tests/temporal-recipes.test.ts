import { describe, expect, test } from "bun:test";
import {
	BUILTIN_VALUE_TERMINAL_IDS,
	compileDomainConfig,
	createBuiltinTerminals,
	createDateTimeRecipeSet,
	createFrequencyRecipeSet,
	generateTimeZoneCodeMap,
	getTimeZoneIsoOffset,
	isValidTimeZone,
	parseConfiguredValue,
	resolveTimeZone,
} from "../src";
import type { DateTimeFormatRegistry } from "../src/values/date-time";
import type { FrequencyGrammarConfig } from "../src/values/frequency";

describe("temporal authored recipe factories", () => {
	test("compileDomainConfig registers authored frequency and date recipes", () => {
		const grammar = compileDomainConfig({
			values: {
				frequency: {
					intervalPrefixes: ["every"],
					timeUnitAliases: { day: ["day", "days"] },
				},
				dateTime: {
					formats: {
						short: {
							id: "short",
							kind: "date",
							tokens: ["YYYY", "MM", "DD"],
							separators: ["", "/", "/", ""],
							fields: ["year", "month", "day"],
						},
					},
					display: { date: "short" },
					parse: { date: ["short"], time: [], datetime: [] },
				},
			},
		});

		expect(grammar.recipes?.recipes.map((recipe) => recipe.id)).toEqual([
			"frequency.interval",
			"date.short",
		]);
	});

	test("authored frequency interval produces canonical CadenceSchedule", () => {
		const frequency: FrequencyGrammarConfig = {
			intervalPrefixes: ["every"],
			timeUnitAliases: { hour: ["hour", "hours"] },
		};
		const builtins = createFrequencyRecipeSet(frequency);
		const grammar = compileDomainConfig(
			{
				values: { frequency },
				fundamentals: builtins.fundamentals,
				recipes: builtins.recipes,
			},
			undefined,
			{
				terminalIds: new Set(BUILTIN_VALUE_TERMINAL_IDS),
				outputBuilderIds: new Set(Object.keys(builtins.outputBuilders)),
			},
		);

		const parsed = parseConfiguredValue(
			"every 4 hours",
			grammar,
			{ enabledRecipes: ["frequency.interval"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.ambiguous).toBe(false);
		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "interval",
			interval: { multiplier: 4, unit: "hour" },
			rawText: "every 4 hours",
		});
		expect(parsed.selected?.captures).toEqual({
			count: "4",
			unit: "hours",
		});
	});

	test("authored frequency conditional produces one_time cadence", () => {
		const frequency: FrequencyGrammarConfig = {
			conditionalAliases: ["as needed"],
			conditionConnectors: ["for"],
		};
		const builtins = createFrequencyRecipeSet(frequency);
		const grammar = compileDomainConfig(
			{
				values: { frequency },
				fundamentals: builtins.fundamentals,
				recipes: builtins.recipes,
			},
			undefined,
			{
				terminalIds: new Set(BUILTIN_VALUE_TERMINAL_IDS),
				outputBuilderIds: new Set(Object.keys(builtins.outputBuilders)),
			},
		);

		const parsed = parseConfiguredValue(
			"as needed for pain",
			grammar,
			{ enabledRecipes: ["frequency.conditional"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "one_time",
			isConditional: true,
			condition: "pain",
			rawText: "as needed for pain",
		});
	});

	test("authored frequency event offset produces event_anchored cadence", () => {
		const frequency: FrequencyGrammarConfig = {
			timeUnitAliases: { hour: ["hour", "hours"] },
			eventAnchorAliases: { bedtime: ["bedtime"] },
			relativeOffsetConnectors: {
				before: [],
				after: [],
				at: ["at"],
				with: [],
			},
		};
		const builtins = createFrequencyRecipeSet(frequency);
		const grammar = compileDomainConfig(
			{
				values: { frequency },
				fundamentals: builtins.fundamentals,
				recipes: builtins.recipes,
			},
			undefined,
			{
				terminalIds: new Set(BUILTIN_VALUE_TERMINAL_IDS),
				outputBuilderIds: new Set(Object.keys(builtins.outputBuilders)),
			},
		);

		const parsed = parseConfiguredValue(
			"2 hours at bedtime",
			grammar,
			{ enabledRecipes: ["frequency.event-offset"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "event_anchored",
			eventAnchor: "bedtime",
			relativeOffset: {
				direction: "at",
				duration: { magnitude: 2, unit: "hour" },
			},
			rawText: "2 hours at bedtime",
		});
	});

	test("authored date output preserves canonical rawText behavior", () => {
		const registry: DateTimeFormatRegistry = {
			formats: {
				"iso-date": {
					id: "iso-date",
					kind: "date",
					tokens: ["YYYY", "MM", "DD"],
					separators: ["", "-", "-", ""],
					fields: ["year", "month", "day"],
				},
			},
			display: { date: "iso-date" },
			parse: { date: ["iso-date"], time: [], datetime: [] },
		};
		const builtins = createDateTimeRecipeSet(registry);
		const grammar = compileDomainConfig(
			{
				values: {},
				fundamentals: builtins.fundamentals,
				recipes: builtins.recipes,
			},
			undefined,
			{
				terminalIds: new Set(BUILTIN_VALUE_TERMINAL_IDS),
				outputBuilderIds: new Set(Object.keys(builtins.outputBuilders)),
			},
		);

		const parsed = parseConfiguredValue(
			"2026-08-17",
			grammar,
			{ enabledRecipes: ["date.iso-date"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			rawText: "2026-08-17",
		});
		expect(parsed.selected?.displayValue).toBe("2026-08-17");
	});

	describe("explicit timezone resolution and policy", () => {
		test("resolveTimeZone honors explicit code-map policy and falls back", () => {
			const codeMap = {
				EST: "America/New_York",
				PST: "America/Los_Angeles",
				HQ: "Europe/London",
			};
			expect(resolveTimeZone("EST", codeMap)).toBe("America/New_York");
			expect(resolveTimeZone("est", codeMap)).toBe("America/New_York");
			expect(resolveTimeZone("HQ", codeMap)).toBe("Europe/London");
			expect(resolveTimeZone("Asia/Tokyo", codeMap)).toBe("Asia/Tokyo");

			const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			expect(resolveTimeZone("", codeMap)).toBe(defaultZone);
			expect(resolveTimeZone(undefined, codeMap)).toBe(defaultZone);
		});

		test("isValidTimeZone enforces explicit timezone policy", () => {
			expect(isValidTimeZone("UTC")).toBe(true);
			expect(isValidTimeZone("America/New_York")).toBe(true);
			expect(isValidTimeZone("Invalid/Fake_Zone")).toBe(false);
		});

		test("getTimeZoneIsoOffset returns canonical offsets", () => {
			expect(getTimeZoneIsoOffset("UTC")).toBe("+00:00");
			const offset = getTimeZoneIsoOffset("America/New_York");
			expect(offset).toMatch(/^[-+]\d{2}:\d{2}$/);
		});

		test("generateTimeZoneCodeMap discovers standard codes", () => {
			const map = generateTimeZoneCodeMap();
			expect(Object.keys(map).length).toBeGreaterThan(0);
			expect(map.UTC || map.Z || map.GMT).toBeDefined();
			expect(generateTimeZoneCodeMap({ blank: true })).toEqual({});
		});
	});
});
