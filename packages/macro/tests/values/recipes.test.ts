import { describe, expect, test } from "bun:test";
import {
	compileValueRecipes,
	type FundamentalGroup,
	parseValueRecipes,
	type TerminalParser,
	type ValueRecipe,
} from "../../src";

const groups: readonly FundamentalGroup[] = [
	{
		id: "range",
		variants: [
			{
				id: "from-to",
				prefix: [{ id: "from", text: "from" }],
				connectors: [[{ id: "to", text: "to" }]],
				slots: [{ id: "start" }, { id: "end" }],
			},
		],
	},
];

const measurement: TerminalParser = (_consumerId, input) => {
	const value = Number(input);
	return Number.isFinite(value) ? { valid: true, value } : { valid: false };
};

describe("value recipes", () => {
	test("requires an explicitly enabled recipe", () => {
		const recipe: ValueRecipe = {
			id: "measurement-range",
			root: {
				kind: "fundamental",
				groupId: "range",
				children: [
					{ kind: "terminal", consumerId: "measurement" },
					{ kind: "terminal", consumerId: "measurement" },
				],
			},
		};
		const compiled = compileValueRecipes(groups, [recipe]);
		expect(
			parseValueRecipes(
				"from 20 to 50",
				compiled.recipes,
				{
					enabledRecipes: [],
				},
				measurement,
			).candidates,
		).toEqual([]);
		const result = parseValueRecipes(
			"from 20 to 50",
			compiled.recipes,
			{
				enabledRecipes: [recipe.id],
			},
			measurement,
		);
		expect(result.selected?.evaluation).toMatchObject({
			slots: {
				start: { value: 20 },
				end: { value: 50 },
			},
		});
	});

	test("rejects unknown recipe references and cycles at compile time", () => {
		const recipes: readonly ValueRecipe[] = [
			{ id: "a", root: { kind: "recipe", recipeId: "b" } },
			{ id: "b", root: { kind: "recipe", recipeId: "a" } },
			{ id: "missing", root: { kind: "recipe", recipeId: "ghost" } },
		];
		const result = compileValueRecipes(groups, recipes);
		expect(result.recipes).toEqual([]);
		expect(result.diagnostics.map((item) => item.errorCode)).toEqual(
			expect.arrayContaining(["RECIPE_CYCLE", "UNKNOWN_RECIPE"]),
		);
	});

	test("rejects recipes whose child count does not match fundamental slots", () => {
		const result = compileValueRecipes(groups, [
			{
				id: "invalid",
				root: {
					kind: "fundamental",
					groupId: "range",
					children: [{ kind: "terminal", consumerId: "measurement" }],
				},
			},
		]);
		expect(result.recipes).toEqual([]);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ errorCode: "RECIPE_SLOT_ARITY" }),
			]),
		);
	});

	test("reports equal priority candidates as ambiguous", () => {
		const recipes: readonly ValueRecipe[] = [
			{
				id: "range-a",
				priority: 1,
				root: {
					kind: "fundamental",
					groupId: "range",
					children: [
						{ kind: "terminal", consumerId: "measurement" },
						{ kind: "terminal", consumerId: "measurement" },
					],
				},
			},
			{
				id: "range-b",
				priority: 1,
				root: {
					kind: "fundamental",
					groupId: "range",
					children: [
						{ kind: "terminal", consumerId: "measurement" },
						{ kind: "terminal", consumerId: "measurement" },
					],
				},
			},
		];
		const compiled = compileValueRecipes(groups, recipes);
		const result = parseValueRecipes(
			"from 20 to 50",
			compiled.recipes,
			{
				enabledRecipes: ["range-a", "range-b"],
			},
			measurement,
		);
		expect(result.ambiguous).toBe(true);
		expect(result.selected).toBeUndefined();
	});

	test("rejects terminals and builders that are absent from the runtime registry", () => {
		const result = compileValueRecipes(
			groups,
			[
				{
					id: "invalid-terminal",
					root: { kind: "terminal", consumerId: "missing-terminal" },
				},
				{
					id: "invalid-builder",
					outputBuilderId: "missing-builder",
					root: { kind: "terminal", consumerId: "measurement" },
				},
			],
			{
				terminalIds: new Set(["measurement"]),
				outputBuilderIds: new Set(),
			},
		);
		expect(result.recipes).toEqual([]);
		expect(result.diagnostics.map((item) => item.errorCode)).toEqual(
			expect.arrayContaining(["UNKNOWN_TERMINAL", "UNKNOWN_OUTPUT_BUILDER"]),
		);
	});

	test("preserves named slot evaluations and capture spans", () => {
		const compiled = compileValueRecipes(groups, [
			{
				id: "measurement-range",
				root: {
					kind: "fundamental",
					groupId: "range",
					children: [
						{ kind: "terminal", consumerId: "measurement" },
						{ kind: "terminal", consumerId: "measurement" },
					],
				},
			},
		]);
		const result = parseValueRecipes(
			"from 20 to 50",
			compiled.recipes,
			{ enabledRecipes: ["measurement-range"] },
			measurement,
		);
		const evaluation = result.selected?.evaluation;
		expect(evaluation).toMatchObject({
			kind: "fundamental",
			groupId: "range",
			variantId: "from-to",
			slots: {
				start: { kind: "terminal", value: 20 },
				end: { kind: "terminal", value: 50 },
			},
		});
		expect(result.selected?.captureSpans).toMatchObject({
			start: { start: 5, end: 7 },
			end: { start: 11, end: 13 },
		});
	});
});
