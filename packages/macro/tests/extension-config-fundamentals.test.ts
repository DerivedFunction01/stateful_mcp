import { describe, expect, test } from "bun:test";
import { compileDomainConfig } from "../src/extensions/config";

describe("compiled extension fundamentals", () => {
	test("compiles profile fundamentals, aliases, and recipes together", () => {
		const result = compileDomainConfig({
			fundamentals: [
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
			],
			aliases: [
				{
					id: "usd",
					namespace: "canonical-id",
					spellings: ["dollars"],
					target: { kind: "canonical", value: "USD" },
				},
			],
			recipes: [
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
			],
		});

		expect(result.aliases?.diagnostics).toEqual([]);
		expect(result.fundamentals?.diagnostics).toEqual([]);
		expect(result.recipes?.diagnostics).toEqual([]);
		expect(result.recipes?.recipes.map((recipe) => recipe.id)).toEqual([
			"measurement-range",
		]);
	});

	test("keeps an empty profile strict", () => {
		const result = compileDomainConfig();
		expect(result.fundamentals?.variants).toEqual([]);
		expect(result.aliases?.namespaces).toEqual({});
		expect(result.recipes?.recipes).toEqual([]);
	});

	test("marks invalid configured recipes as unusable", () => {
		const result = compileDomainConfig({
			recipes: [
				{
					id: "broken",
					root: { kind: "recipe", recipeId: "missing" },
				},
			],
		});
		expect(result.valid).toBe(false);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ errorCode: "UNKNOWN_RECIPE" }),
			]),
		);
	});
});
