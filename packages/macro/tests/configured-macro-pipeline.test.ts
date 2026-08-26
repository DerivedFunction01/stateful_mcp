import { describe, expect, test } from "bun:test";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type { MacroSpec } from "../src/contracts/macro";
import {
	compileDomainConfig,
	resolveArgumentPolicy,
} from "../src/extensions/config";
import { parseMacroLine } from "../src/parser/macro-parser";
import { compileMacroPayload } from "../src/payload/payload-compiler";
import type { RecipeOutputBuilderContext } from "../src/values/recipes";

const grammar = compileDomainConfig({
	fundamentals: [
		{
			id: "range",
			variants: [
				{
					id: "from-to",
					prefix: [{ id: "from", text: "from" }],
					connectors: [[{ id: "to", text: "to" }]],
					slots: [{ id: "low" }, { id: "high" }],
				},
			],
		},
	],
	recipes: [
		{
			id: "quantity-range",
			outputBuilderId: "range-object",
			root: {
				kind: "fundamental",
				groupId: "range",
				children: [
					{ kind: "terminal", consumerId: "number" },
					{ kind: "terminal", consumerId: "number" },
				],
			},
		},
	],
});

const spec: MacroSpec = {
	id: "test.range",
	name: "range",
	arguments: [
		{
			argumentId: "value",
			name: "value",
			path: "test.value",
			configuredValue: { consumerId: "number" },
			required: true,
		},
	],
};

const options = {
	context: createMacroRuntimeContext({ macroStartToken: "^" }),
	configuredValues: {
		grammar,
		policies: {
			value: resolveArgumentPolicy("test", "range", "value", grammar, {
				enabledRecipes: ["quantity-range"],
			}),
		},
		terminals: {
			number: (_id: string, input: string) => ({
				valid: /^\d+$/u.test(input.trim()),
				value: Number(input),
			}),
		},
		outputBuilders: {
			"range-object": ({ evaluation }: RecipeOutputBuilderContext) => {
				if (evaluation.kind !== "fundamental") return { valid: false };
				const values = Object.values(evaluation.slots).map((slot) =>
					slot.kind === "terminal" ? slot.value : undefined,
				);
				return {
					valid: values.length === 2,
					value: { low: values[0], high: values[1] },
				};
			},
		},
	},
};

describe("configured macro value pipeline", () => {
	test("binds a recipe result as a canonical macro match and payload value", () => {
		const parsed = parseMacroLine("^range value=from 20 to 50", spec, options);
		expect(parsed?.diagnostics).toEqual([]);
		expect(parsed?.matches[0]).toMatchObject({
			source: "configured",
			recipeId: "quantity-range",
			canonicalValue: { low: 20, high: 50 },
		});

		const payload = compileMacroPayload(
			spec,
			"^range value=from 20 to 50",
			options,
		);
		expect(payload.status).toBe("matched");
		expect(payload.payload).toEqual({ test: { value: { low: 20, high: 50 } } });
	});

	test("does not fall back to a literal value when configured parsing fails", () => {
		const parsed = parseMacroLine("^range value=from 20 and 50", spec, options);
		expect(parsed?.matches).toEqual([]);
		expect(parsed?.arguments[0]?.match).toBeUndefined();
	});
});
