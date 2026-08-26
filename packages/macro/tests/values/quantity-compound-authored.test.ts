import { describe, expect, test } from "bun:test";
import {
	compileAuthoredValueGraph,
	createBuiltinTerminals,
	parseConfiguredValue,
} from "../../src";
import { createCompoundQuantityOutputBuilder } from "../../src/values/compound";
import { createCommonConversionRegistry } from "../../src/values/conversion";
import {
	compileAuthoredQuantityTemplates,
	createQuantityOutputBuilders,
} from "../../src/values/quantity";

describe("authored quantity and compound values", () => {
	test("keeps an explicitly authored unordered single-quantity structure", () => {
		const authored = compileAuthoredQuantityTemplates({
			templates: ["UNIT NUM"],
			unitAliases: { kg: ["kg"] },
		});
		const graph = compileAuthoredValueGraph({
			unitAliases: { kg: ["kg"] },
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});

		expect(
			authored.fundamentals[0]?.variants[0]?.slots.map((slot) => slot.parserId),
		).toEqual(["UNIT", "NUM"]);
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

	test("builds an authored range from explicit configured slots", () => {
		const graph = compileAuthoredValueGraph({
			fundamentals: [
				{
					id: "quantity.range",
					variants: [
						{
							id: "range",
							slots: [
								{ id: "start", pattern: "start" },
								{ id: "end", pattern: "end" },
							],
							connectors: [[{ id: "space", text: " ", boundary: "none" }]],
						},
					],
				},
			],
			recipes: [
				{
					id: "quantity.range",
					root: {
						kind: "fundamental",
						groupId: "quantity.range",
						children: [
							{ kind: "terminal", consumerId: "range-start" },
							{ kind: "terminal", consumerId: "range-end" },
						],
					},
					outputBuilderId: "quantity.range",
				},
			],
		});
		const parsed = parseConfiguredValue(
			"start end",
			graph.grammar,
			{ enabledRecipes: ["quantity.range"] },
			{
				terminals: {
					"range-start": () => ({
						valid: true,
						value: {
							primaryQuantity: { magnitude: 5, unit: "kg", rawText: "5 kg" },
							rawText: "5 kg",
						},
					}),
					"range-end": () => ({
						valid: true,
						value: {
							primaryQuantity: { magnitude: 10, unit: "kg", rawText: "10 kg" },
							rawText: "10 kg",
						},
					}),
				},
				outputBuilders: createQuantityOutputBuilders(),
			},
		);

		expect(parsed.selected?.canonicalValue).toMatchObject({
			primaryQuantity: { magnitude: 5, unit: "kg" },
			range: { direction: "ascending" },
		});
	});

	test("preserves explicit packaging and concept semantics", async () => {
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
		const parsed = await import("../../src").then(
			({ parseConfiguredValueAsync, createAsyncBuiltinTerminals }) =>
				parseConfiguredValueAsync(
					"5 boxes of gloves",
					graph.grammar,
					{ enabledRecipes: ["quantity.template.0"] },
					{
						terminals: createAsyncBuiltinTerminals({ grammar: graph.grammar }),
						outputBuilders: createQuantityOutputBuilders(),
					},
				),
		);

		expect(parsed.selected?.canonicalValue).toMatchObject({
			primaryQuantity: {
				unit: "box",
				conceptDetails: { conceptTerm: "gloves" },
			},
		});
	});

	test("converts an authored compound chain through the conversion registry", () => {
		const registry = createCommonConversionRegistry();
		const authored = compileAuthoredQuantityTemplates({
			templates: ["NUM UNIT NUM UNIT"],
			unitAliases: { "[ft_i]": ["ft"], "[in_i]": ["in"] },
			conversionRegistry: registry,
		});
		const graph = compileAuthoredValueGraph({
			unitAliases: { "[ft_i]": ["ft"], "[in_i]": ["in"] },
			values: { quantity: { conversionRegistry: registry } },
			fundamentals: authored.fundamentals,
			recipes: authored.recipes,
		});
		const parsed = parseConfiguredValue(
			"5 ft 11 in",
			graph.grammar,
			{
				enabledRecipes: ["quantity.template.0"],
				quantityConsumerPolicy: { allowedUnits: ["[in_i]"] },
			},
			{
				terminals: createBuiltinTerminals({ grammar: graph.grammar }),
				outputBuilders: {
					"quantity.compound": createCompoundQuantityOutputBuilder(),
				},
			},
		);

		expect(parsed.selected?.canonicalValue).toMatchObject({
			kind: "quantity",
			magnitude: 71,
			unit: "[in_i]",
		});
	});
});
