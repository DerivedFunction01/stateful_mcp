import { describe, expect, test } from "bun:test";
import { compileDomainConfig } from "../src/extensions/config";
import { parseConfiguredValue } from "../src/values/engine";

describe("configured value engine", () => {
	test("uses only enabled recipes and terminal parsers", () => {
		const grammar = compileDomainConfig({
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
		const result = parseConfiguredValue(
			"from 20 to 50",
			grammar,
			{
				enabledRecipes: ["measurement-range"],
			},
			{
				terminals: {
					measurement: (_id, value) => ({
						valid: /^\d+$/u.test(value),
						value: Number(value),
					}),
				},
			},
		);
		expect(result.selected?.recipeId).toBe("measurement-range");
		expect(result.selected?.evaluation).toMatchObject({
			slots: {
				start: { value: 20 },
				end: { value: 50 },
			},
		});
	});

	test("does not parse an unconfigured connector", () => {
		const grammar = compileDomainConfig({
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
			recipes: [
				{
					id: "range",
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
		const result = parseConfiguredValue(
			"from 20 and 50",
			grammar,
			{
				enabledRecipes: ["range"],
			},
			{ terminals: { number: () => ({ valid: true }) } },
		);
		expect(result.candidates).toEqual([]);
	});
});
