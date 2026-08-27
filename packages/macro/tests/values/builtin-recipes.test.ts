import { describe, expect, test } from "bun:test";
import {
	BUILTIN_VALUE_TERMINAL_IDS,
	compileDomainConfig,
	createBuiltinTerminals,
	parseConfiguredValue,
} from "../../src";
import type { FrequencyGrammarConfig } from "../../src/values/frequency";
import type { CompoundRateConfig } from "../../src/values/rates";
import {
	createFrequencyRecipeSet,
	createRateRecipeSet,
} from "../support/builtin-recipes";

describe("opt-in built-in recipe factories", () => {
	test("parses a configured frequency through bounded slots", () => {
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

	test("parses configured multiplier recurrence syntax", () => {
		const frequency: FrequencyGrammarConfig = {
			recurrenceConnectors: ["a"],
			timeUnitAliases: { day: ["day", "days"] },
			multiplierAliases: { "2": ["twice"] },
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
			"twice a day",
			grammar,
			{ enabledRecipes: ["frequency.recurrence"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "recurrence",
			recurrence: { count: 2, period: "day" },
			rawText: "twice a day",
		});
	});

	test("parses configured interval ranges", () => {
		const frequency: FrequencyGrammarConfig = {
			intervalPrefixes: ["every"],
			rangeComponents: [
				{
					id: "interval-range",
					connector: [{ id: "to", text: "to" }],
				},
			],
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
			"every 2 to 4 hours",
			grammar,
			{ enabledRecipes: ["frequency.interval-range"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "interval",
			interval: { multiplier: 2, upperMultiplier: 4, unit: "hour" },
			rawText: "every 2 to 4 hours",
		});
	});

	test("parses configured shorthand as an exact terminal recipe", () => {
		const frequency: FrequencyGrammarConfig = {
			frequencyAliases: {
				qd: {
					cadenceType: "recurrence",
					recurrence: { count: 1, period: "day" },
				},
			},
		};
		const builtins = createFrequencyRecipeSet(frequency);
		const grammar = compileDomainConfig(
			{ values: { frequency }, recipes: builtins.recipes },
			undefined,
			{ terminalIds: new Set(BUILTIN_VALUE_TERMINAL_IDS) },
		);
		const parsed = parseConfiguredValue(
			"qd",
			grammar,
			{ enabledRecipes: ["frequency.alias"] },
			{ terminals: createBuiltinTerminals({ grammar }) },
		);

		expect(parsed.selected?.canonicalValue).toEqual({
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "day" },
			rawText: "qd",
		});
	});

	test("parses configured event-anchor offsets", () => {
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

	test("parses configured conditional cadence syntax", () => {
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

	test("parses a finite quantity rate recipe", () => {
		const rates: CompoundRateConfig = { rateDelimiters: ["per"] };
		const builtins = createRateRecipeSet(rates);
		const grammar = compileDomainConfig(
			{
				unitAliases: { mg: ["mg"], hour: ["hour"] },
				values: { rates },
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
			"10 mg per 2 hour",
			grammar,
			{ enabledRecipes: ["rate.quantity"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toMatchObject({
			kind: "rate",
			numerator: { type: "quantity", quantity: { magnitude: 10, unit: "mg" } },
			denominators: [{ magnitude: 2, unit: "hour" }],
		});
	});

	test("supports only the explicitly defined two-denominator rate chain", () => {
		const rates: CompoundRateConfig = { rateDelimiters: ["per"] };
		const builtins = createRateRecipeSet(rates);
		const grammar = compileDomainConfig(
			{
				unitAliases: { mg: ["mg"], kg: ["kg"], day: ["day"] },
				values: { rates },
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
			"10 mg per 2 kg per 3 day",
			grammar,
			{ enabledRecipes: ["rate.quantity-chain"] },
			{
				terminals: createBuiltinTerminals({ grammar }),
				outputBuilders: builtins.outputBuilders,
			},
		);

		expect(parsed.selected?.canonicalValue).toMatchObject({
			kind: "rate",
			denominators: [{ unit: "kg" }, { unit: "day" }],
		});
	});
});
