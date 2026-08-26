import { describe, expect, test } from "bun:test";
import type { UserMacroProfile } from "../src/contracts/extension-config";
import { resolveArgumentPolicy } from "../src/extensions/config";
import { parseMacroLine } from "../src/parser/macro-parser";
import {
	authoredValueGraphFingerprint,
	clearCompiledGraphCache,
	compileAuthoredValueGraph,
} from "../src/values/authoring";
import { createDateTimeRecipeSet } from "../src/values/date-time";
import { parseConfiguredValue } from "../src/values/engine";
import {
	deserializeValueAuthoringProfile,
	resolveEffectiveProfile,
	serializeValueAuthoringProfile,
} from "../src/workspace/config/value-authoring";

describe("Phase 1: Canonical Compiler and Runtime Integration", () => {
	describe("1. Profile Inheritance & Tombstone Suppression", () => {
		const baseProfile: UserMacroProfile = {
			id: "base",
			aliases: [
				{
					id: "alias-usd",
					namespace: "canonical-id",
					spellings: ["$"],
					target: { kind: "canonical", value: "USD" },
				},
				{
					id: "alias-eur",
					namespace: "canonical-id",
					spellings: ["€"],
					target: { kind: "canonical", value: "EUR" },
				},
			],
			fundamentals: [
				{
					id: "fund-base",
					variants: [
						{
							id: "v1",
							slots: [{ id: "s1", parserId: "text" }],
						},
					],
				},
			],
			recipes: [
				{
					id: "recipe-base",
					priority: 10,
					root: {
						kind: "fundamental",
						groupId: "fund-base",
						children: [{ kind: "terminal", consumerId: "text" }],
					},
				},
			],
			values: {
				dateTime: {
					formats: {
						"date.iso": {
							id: "date.iso",
							kind: "date",
							source: "YYYY-MM-DD",
						},
					},
					display: { date: "date.iso" },
					parse: { date: ["date.iso"], time: [], datetime: [] },
				},
			},
		};

		test("replaces stable IDs, appends new IDs, and suppresses removed IDs", () => {
			const derivedProfile: UserMacroProfile = {
				id: "derived",
				extends: "base",
				aliases: [
					{
						id: "alias-usd",
						namespace: "canonical-id",
						spellings: ["$", "USD", "dollars"],
						target: { kind: "canonical", value: "USD" },
					},
					{
						id: "alias-gbp",
						namespace: "canonical-id",
						spellings: ["£"],
						target: { kind: "canonical", value: "GBP" },
					},
				],
				recipes: [
					{
						id: "recipe-base",
						priority: 50,
						root: {
							kind: "fundamental",
							groupId: "fund-base",
							children: [{ kind: "terminal", consumerId: "text" }],
						},
					},
					{
						id: "recipe-derived",
						priority: 20,
						root: {
							kind: "fundamental",
							groupId: "fund-base",
							children: [{ kind: "terminal", consumerId: "text" }],
						},
					},
				],
				values: {
					dateTime: {
						formats: {
							"date.custom": {
								id: "date.custom",
								kind: "date",
								source: "YYYY.MM.DD",
							},
						},
					},
				},
				removedIds: {
					aliases: ["alias-eur"],
					dateTimeFormats: ["date.iso"],
				},
			};

			const effective = resolveEffectiveProfile(derivedProfile, baseProfile);

			// Aliases
			expect(effective.aliases).toHaveLength(2);
			const usd = effective.aliases?.find((a) => a.id === "alias-usd");
			expect(usd?.spellings).toEqual(["$", "USD", "dollars"]);
			const gbp = effective.aliases?.find((a) => a.id === "alias-gbp");
			expect(gbp?.spellings).toEqual(["£"]);
			expect(effective.aliases?.some((a) => a.id === "alias-eur")).toBe(false);

			// Fundamentals
			expect(effective.fundamentals).toHaveLength(1);
			expect(effective.fundamentals?.[0]?.id).toBe("fund-base");

			// Recipes
			expect(effective.recipes).toHaveLength(2);
			const baseRecipe = effective.recipes?.find((r) => r.id === "recipe-base");
			expect(baseRecipe?.priority).toBe(50);
			const derivedRecipe = effective.recipes?.find(
				(r) => r.id === "recipe-derived",
			);
			expect(derivedRecipe?.priority).toBe(20);

			// Date Time Formats
			const formats = effective.values?.dateTime?.formats ?? {};
			expect(formats["date.iso"]).toBeUndefined();
			expect(formats["date.custom"]).toBeDefined();
			expect(formats["date.custom"]?.source).toBe("YYYY.MM.DD");
		});

		test("serializes and deserializes UserMacroProfile with optional collections", () => {
			const minimalProfile: UserMacroProfile = {
				id: "minimal",
				locale: "en-US",
			};
			const json = serializeValueAuthoringProfile(minimalProfile);
			const restored = deserializeValueAuthoringProfile(json);
			expect(restored.id).toBe("minimal");
			expect(restored.locale).toBe("en-US");
		});
	});

	describe("2. Source-Preserving Date-Time Format Compilation", () => {
		test("compiles natural source string into tokens, separators, fields, and capability", () => {
			const recipeSet = createDateTimeRecipeSet({
				formats: {
					"date.slash": {
						id: "date.slash",
						kind: "date",
						source: "YYYY/MM/DD",
						parserPriority: 30,
					},
				},
				display: { date: "date.slash" },
				parse: { date: ["date.slash"], time: [], datetime: [] },
			});

			expect(recipeSet.fundamentals).toHaveLength(1);
			expect(recipeSet.recipes).toHaveLength(1);

			const recipe = recipeSet.recipes[0]!;
			expect(recipe.id).toBe("date.date.slash");
			expect(recipe.priority).toBe(30);
			expect(recipe.capability).toEqual({
				valueKind: "date-time",
				providedFields: ["year", "month", "day"],
			});

			// Verify output builder returns structured date fields
			const builder = recipeSet.outputBuilders["date.date.slash"];
			expect(builder).toBeDefined();
			const buildResult = builder!({
				recipeId: "date.date.slash",
				input: "2026/08/26",
				captures: {},
				evaluation: {
					kind: "fundamental",
					groupId: "date.date.slash",
					variantId: "date.slash",
					slots: {
						"date.slash-YYYY": {
							kind: "terminal",
							consumerId: "date-year",
							input: "2026",
							value: 2026,
						},
						"date.slash-MM": {
							kind: "terminal",
							consumerId: "date-month",
							input: "08",
							value: 8,
						},
						"date.slash-DD": {
							kind: "terminal",
							consumerId: "date-day",
							input: "26",
							value: 26,
						},
					},
					captures: {},
					captureSpans: {},
				},
			});
			expect(buildResult.valid).toBe(true);
			expect(buildResult.value).toEqual({
				rawText: "2026/08/26",
				year: 2026,
				month: 8,
				day: 26,
			});
		});
	});

	describe("3. Syntax Compilation & Profile Inheritance", () => {
		test("compiles syntax into grammar and fingerprint differentiates syntax changes", () => {
			const base: UserMacroProfile = {
				id: "syntax-base",
				syntax: {
					macroStartToken: "@",
					argumentDelimiter: ";",
				},
			};

			const derived: UserMacroProfile = {
				id: "syntax-derived",
				extends: "syntax-base",
				syntax: {
					argumentDelimiter: "|",
				},
			};

			const effective = resolveEffectiveProfile(derived, base);
			expect(effective.syntax?.macroStartToken).toBe("@");
			expect(effective.syntax?.argumentDelimiter).toBe("|");

			const compiledBase = compileAuthoredValueGraph(base);
			expect(compiledBase.grammar.syntax?.macroStartToken).toBe("@");
			expect(compiledBase.grammar.syntax?.argumentDelimiter).toBe(";");

			const compiledEffective = compileAuthoredValueGraph(effective);
			expect(compiledEffective.grammar.syntax?.macroStartToken).toBe("@");
			expect(compiledEffective.grammar.syntax?.argumentDelimiter).toBe("|");

			expect(compiledEffective.fingerprint).not.toBe(compiledBase.fingerprint);
		});
	});

	describe("4. Graph Fingerprint Caching", () => {
		test("reuses compiled grammar graph when profile fingerprint is identical", () => {
			clearCompiledGraphCache();
			const profile: UserMacroProfile = {
				id: "cached-profile",
				aliases: [
					{
						id: "alias-test",
						namespace: "canonical-id",
						spellings: ["test"],
						target: { kind: "canonical", value: "TEST" },
					},
				],
			};

			const fp1 = authoredValueGraphFingerprint(profile);
			const res1 = compileAuthoredValueGraph(profile);
			expect(res1.fingerprint).toBe(fp1);

			// Calling compile again with same profile
			const res2 = compileAuthoredValueGraph(profile);
			expect(res2).toBe(res1); // exact same object reference

			// Modifying profile
			const modified: UserMacroProfile = {
				...profile,
				aliases: [
					...profile.aliases!,
					{
						id: "alias-test-2",
						namespace: "canonical-id",
						spellings: ["test2"],
						target: { kind: "canonical", value: "TEST2" },
					},
				],
			};
			const res3 = compileAuthoredValueGraph(modified);
			expect(res3).not.toBe(res1);
			expect(res3.fingerprint).not.toBe(fp1);
		});
	});

	describe("5. Capability-Based Semantic Candidate Filtering", () => {
		test("filters candidate recipes based on ValueRequest requirements", () => {
			const profile: UserMacroProfile = {
				id: "capability-profile",
				values: {
					dateTime: {
						formats: {
							"date.iso": {
								id: "date.iso",
								kind: "date",
								source: "YYYY-MM-DD",
								parserPriority: 10,
							},
						},
						display: { date: "date.iso" },
						parse: { date: ["date.iso"], time: [], datetime: [] },
					},
				},
			};

			const compilation = compileAuthoredValueGraph(profile);
			const terminals = {
				"date-year": () => ({ valid: true, value: 2026 }),
				"date-month": () => ({ valid: true, value: 8 }),
				"date-day": () => ({ valid: true, value: 26 }),
				text: () => ({ valid: true, value: "" }),
			};
			const builders = {
				"date.date.iso": ({ input }: { input: string }) => ({
					valid: true,
					value: { rawText: input, year: 2026, month: 8, day: 26 },
				}),
			};

			// 1. Request matching year and month: should match
			const matchRes = parseConfiguredValue(
				"2026-08-26",
				compilation.grammar,
				{ enabledRecipes: ["date.date.iso"] },
				{
					terminals,
					outputBuilders: builders,
					valueRequest: {
						valueKind: "date-time",
						requiredFields: ["year", "month"],
					},
				},
			);
			expect(matchRes.selected).toBeDefined();
			expect(matchRes.selected?.recipeId).toBe("date.date.iso");

			// 2. Request requiring hour (which is not provided by date.iso): should be filtered out
			const mismatchRes = parseConfiguredValue(
				"2026-08-26",
				compilation.grammar,
				{ enabledRecipes: ["date.date.iso"] },
				{
					terminals,
					outputBuilders: builders,
					valueRequest: {
						valueKind: "date-time",
						requiredFields: ["hour"],
					},
				},
			);
			expect(mismatchRes.selected).toBeUndefined();
			expect(mismatchRes.candidates).toHaveLength(0);

			// 3. Request with wrong valueKind (e.g. quantity): should be filtered out
			const wrongKindRes = parseConfiguredValue(
				"2026-08-26",
				compilation.grammar,
				{ enabledRecipes: ["date.date.iso"] },
				{
					terminals,
					outputBuilders: builders,
					valueRequest: {
						valueKind: "quantity",
						requiredFields: ["amount"],
					},
				},
			);
			expect(wrongKindRes.selected).toBeUndefined();
			expect(wrongKindRes.candidates).toHaveLength(0);
		});
	});

	describe("6. Production Macro Parsing & Runtime Graph Integration", () => {
		test("filters configured argument candidates by capability during macro line parsing", () => {
			const profile: UserMacroProfile = {
				id: "macro-runtime-profile",
				syntax: { macroStartToken: "#" },
				values: {
					dateTime: {
						formats: {
							"date.iso": {
								id: "date.iso",
								kind: "date",
								source: "YYYY-MM-DD",
								parserPriority: 10,
							},
						},
						display: { date: "date.iso" },
						parse: { date: ["date.iso"], time: [], datetime: [] },
					},
				},
			};

			const compilation = compileAuthoredValueGraph(profile);
			const terminals = {
				"date-year": () => ({ valid: true, value: 2026 }),
				"date-month": () => ({ valid: true, value: 8 }),
				"date-day": () => ({ valid: true, value: 26 }),
				text: () => ({ valid: true, value: "" }),
			};
			const builders = {
				"date.date.iso": ({ input }: { input: string }) => ({
					valid: true,
					value: { rawText: input, year: 2026, month: 8, day: 26 },
				}),
			};

			const configuredRuntime = {
				grammar: compilation.grammar,
				terminals,
				outputBuilders: builders,
				policies: {
					startDate: resolveArgumentPolicy(
						"ext",
						"event",
						"startDate",
						compilation.grammar,
						{
							enabledRecipes: ["date.date.iso"],
						},
					),
					startTime: resolveArgumentPolicy(
						"ext",
						"event",
						"startTime",
						compilation.grammar,
						{
							enabledRecipes: ["date.date.iso"],
						},
					),
				},
			};

			const spec: import("../src").MacroSpec = {
				id: "event",
				name: "event",
				arguments: [
					{
						argumentId: "startDate",
						name: "date",
						path: "event.startDate",
						configuredValue: {
							valueRequest: {
								valueKind: "date-time",
								requiredFields: ["year", "month"],
							},
						},
					},
				],
			};

			const parseOptions: import("../src").MacroParseOptions = {
				context: {
					syntax: { macroStartToken: "#" },
				},
				configuredValues: configuredRuntime,
			};

			const result = parseMacroLine(
				'#event date="2026-08-26"',
				spec,
				parseOptions,
			);
			expect(result).not.toBeNull();
			expect(result?.matches).toHaveLength(1);
			expect(result?.matches[0]?.argumentId).toBe("startDate");
			expect(result?.matches[0]?.canonicalValue).toEqual({
				rawText: "2026-08-26",
				year: 2026,
				month: 8,
				day: 26,
			});

			// Argument requiring hour should not match the date-only recipe
			const specWithHour: import("../src").MacroSpec = {
				id: "event-time",
				name: "event",
				arguments: [
					{
						argumentId: "startTime",
						name: "time",
						path: "event.startTime",
						configuredValue: {
							valueRequest: {
								valueKind: "date-time",
								requiredFields: ["hour"],
							},
						},
					},
				],
			};

			const resultHour = parseMacroLine(
				'#event time="2026-08-26"',
				specWithHour,
				parseOptions,
			);
			expect(resultHour).not.toBeNull();
			expect(resultHour?.matches).toHaveLength(0);
		});
	});
});
