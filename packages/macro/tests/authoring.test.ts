import { describe, expect, test } from "bun:test";
import {
	compileAuthoredValueGraph,
	createAsyncBuiltinTerminals,
	createBuiltinTerminals,
	parseConfiguredValue,
	parseConfiguredValueAsync,
} from "../src";
import { createCompoundQuantityOutputBuilder } from "../src/values/compound";
import { createFundamentalFromAuthoredFormat } from "../src/values/fundamentals";
import {
	compileAuthoredQuantityTemplates,
	createQuantityOutputBuilders,
	createSingleQuantity,
} from "../src/values/quantity";
import {
	compileAuthoredTemplate,
	parseAuthoredTemplate,
	parseAuthoredTemplateAsync,
} from "../src/values/template-compiler";

describe("user-authored value graph", () => {
	test("compiles and parses the exact authored ordering", () => {
		const graph = compileAuthoredValueGraph({
			fundamentals: [
				{
					id: "date.custom",
					variants: [
						{
							id: "month-day-year",
							slots: [
								{ id: "month", pattern: "[0-9]{1,2}" },
								{ id: "day", pattern: "[0-9]{1,2}" },
								{ id: "year", pattern: "[0-9]{4}" },
							],
							connectors: [
								[{ id: "slash-1", text: "/", boundary: "none" }],
								[{ id: "slash-2", text: "/", boundary: "none" }],
							],
						},
					],
				},
			],
			recipes: [
				{
					id: "date.custom",
					root: {
						kind: "fundamental",
						groupId: "date.custom",
						children: [
							{ kind: "terminal", consumerId: "date-month" },
							{ kind: "terminal", consumerId: "date-day" },
							{ kind: "terminal", consumerId: "date-year" },
						],
					},
				},
			],
		});

		expect(graph.valid).toBe(true);
		const parsed = parseConfiguredValue(
			"03/14/2025",
			graph.grammar,
			{ enabledRecipes: ["date.custom"] },
			{ terminals: createBuiltinTerminals({ grammar: graph.grammar }) },
		);
		expect(parsed.selected?.captures).toMatchObject({
			month: "03",
			day: "14",
			year: "2025",
		});
	});

	test("does not create recognition for an empty authored graph", () => {
		const graph = compileAuthoredValueGraph({});
		expect(graph.valid).toBe(false);
		const parsed = parseConfiguredValue(
			"42",
			graph.grammar,
			{},
			{ terminals: { number: () => ({ valid: true, value: 42 }) } },
		);
		expect(parsed.candidates).toEqual([]);
	});

	test("constructs a bounded quantity with configured canonical conversion", () => {
		const quantity = createSingleQuantity(
			1.5,
			"kg",
			{
				unitAliases: { kg: ["kg"] },
			},
			"1.5 kg",
		);
		expect(quantity).toEqual({
			magnitude: 1.5,
			unit: "kg",
			rawText: "1.5 kg",
		});
		expect(
			createSingleQuantity(
				1,
				"unknown",
				{ unitAliases: { kg: ["kg"] } },
				"1 unknown",
			),
		).toBeUndefined();
	});

	test("builds an authored quantity from amount and unit slots", () => {
		const graph = compileAuthoredValueGraph({
			unitAliases: { mg: ["mg"] },
			fundamentals: [
				{
					id: "quantity.single",
					variants: [
						{
							id: "amount-unit",
							slots: [
								{ id: "amount", pattern: "[0-9]+" },
								{ id: "unit", pattern: "mg" },
							],
							connectors: [[{ id: "space", text: " ", boundary: "none" }]],
						},
					],
				},
			],
			recipes: [
				{
					id: "quantity.single",
					root: {
						kind: "fundamental",
						groupId: "quantity.single",
						children: [
							{ kind: "terminal", consumerId: "quantity-amount" },
							{ kind: "terminal", consumerId: "quantity-unit" },
						],
					},
					outputBuilderId: "quantity.single",
				},
			],
		});
		const parsed = parseConfiguredValue(
			"25 mg",
			graph.grammar,
			{ enabledRecipes: ["quantity.single"] },
			{
				terminals: createBuiltinTerminals({ grammar: graph.grammar }),
				outputBuilders: createQuantityOutputBuilders(),
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			primaryQuantity: { magnitude: 25, unit: "mg" },
		});
	});

	test("preserves arbitrary authored token ordering", async () => {
		const format = {
			tokens: ["UNIT", "NUM"],
			separators: ["", " ", ""],
		};
		const compiled = compileAuthoredTemplate(format, {
			UNIT: { pattern: "(?:kg|mg)" },
			NUM: { pattern: "[0-9]+" },
		});
		const parsed = parseAuthoredTemplate("kg 5", format, compiled, {
			UNIT: ({ rawText }) => rawText,
			NUM: ({ rawText }) => Number(rawText),
		});
		expect(parsed.components.map((component) => component.tokenId)).toEqual([
			"UNIT",
			"NUM",
		]);

		const asyncParsed = await parseAuthoredTemplateAsync(
			"kg 5",
			format,
			compiled,
			{
				UNIT: async ({ rawText }) => rawText,
				NUM: async ({ rawText }) => Number(rawText),
			},
		);
		expect(asyncParsed.components[0]?.value).toBe("kg");
		expect(asyncParsed.components[1]?.value).toBe(5);
	});

	test("compiles authored token order into one fundamental", () => {
		const fundamental = createFundamentalFromAuthoredFormat(
			"quantity.user-defined",
			{ tokens: ["UNIT", "NUM"], separators: ["", " ", ""] },
			{
				UNIT: { pattern: "(?:kg|mg)" },
				NUM: { pattern: "[0-9]+" },
			},
		);
		expect(fundamental.variants).toHaveLength(1);
		expect(fundamental.variants[0]?.slots.map((slot) => slot.parserId)).toEqual(
			["UNIT", "NUM"],
		);
		expect(fundamental.variants[0]?.connectors?.[0]?.[0]?.text).toBe(" ");
	});

	test("compiles quantity template ordering without generating permutations", () => {
		const authored = compileAuthoredQuantityTemplates({
			templates: ["UNIT NUM"],
			unitAliases: { kg: ["kg"] },
		});
		expect(authored.fundamentals).toHaveLength(1);
		expect(authored.recipes).toHaveLength(1);
		expect(
			authored.fundamentals[0]?.variants[0]?.slots.map((slot) => slot.parserId),
		).toEqual(["UNIT", "NUM"]);
		const graph = compileAuthoredValueGraph({
			unitAliases: { kg: ["kg"] },
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = parseConfiguredValue(
			"kg 5",
			graph.grammar,
			{ enabledRecipes: ["quantity.template.0"] },
			{
				terminals: createBuiltinTerminals({ grammar: graph.grammar }),
				outputBuilders: createQuantityOutputBuilders(),
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			primaryQuantity: { magnitude: 5, unit: "kg" },
		});
	});

	test("requires async concept resolution in authored packaging templates", async () => {
		const authored = compileAuthoredQuantityTemplates({
			templates: ["NUM PKG_CLASSIFIER FILLER CONCEPT"],
			unitAliases: { box: ["box"] },
			packagingClassifiers: { box: ["boxes"] },
			fillerConnectors: ["of"],
			conceptResolver: async (term) =>
				term === "gloves" ? { conceptId: "inventory.gloves" } : undefined,
		});
		const graph = compileAuthoredValueGraph({
			unitAliases: { box: ["box"] },
			values: {
				quantity: {
					packagingClassifiers: { box: ["boxes"] },
					fillerConnectors: ["of"],
					conceptResolver: async (term) =>
						term === "gloves" ? { conceptId: "inventory.gloves" } : undefined,
				},
			},
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = await parseConfiguredValueAsync(
			"5 boxes of gloves",
			graph.grammar,
			{ enabledRecipes: ["quantity.template.0"] },
			{
				terminals: createAsyncBuiltinTerminals({ grammar: graph.grammar }),
				outputBuilders: createQuantityOutputBuilders(),
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			primaryQuantity: {
				magnitude: 5,
				unit: "box",
				conceptDetails: { conceptId: "inventory.gloves" },
			},
		});
	});

	test("builds an authored compound quantity chain", () => {
		const authored = compileAuthoredQuantityTemplates({
			templates: ["NUM UNIT NUM UNIT"],
			unitAliases: { ft: ["ft"] },
		});
		const graph = compileAuthoredValueGraph({
			unitAliases: { ft: ["ft"] },
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = parseConfiguredValue(
			"5 ft 11 ft",
			graph.grammar,
			{ enabledRecipes: ["quantity.template.0"] },
			{
				terminals: createBuiltinTerminals({ grammar: graph.grammar }),
				outputBuilders: {
					quantity: createQuantityOutputBuilders()["quantity.template"]!,
					"quantity.compound": createCompoundQuantityOutputBuilder(),
				},
			},
		);
		expect(parsed.selected?.canonicalValue).toMatchObject({
			kind: "quantity",
			chain: [
				{ value: 5, unit: "ft" },
				{ value: 11, unit: "ft" },
			],
		});
	});
});
