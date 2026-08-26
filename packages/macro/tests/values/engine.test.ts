import { describe, expect, test } from "bun:test";
import type { CompiledArgumentPolicy } from "../../src/contracts/extension-config";
import { compileDomainConfig } from "../../src/extensions/config";
import {
	parseConfiguredArgument,
	parseConfiguredArgumentAsync,
	parseConfiguredValue,
} from "../../src/values/engine";
import { createAsyncBuiltinTerminals } from "../../src/values/terminals";

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

	test("does not recognize values when no recipe is enabled", () => {
		const grammar = compileDomainConfig({
			recipes: [
				{
					id: "number",
					root: { kind: "terminal", consumerId: "number" },
				},
			],
		});
		const result = parseConfiguredValue(
			"42",
			grammar,
			{},
			{ terminals: { number: () => ({ valid: true, value: 42 }) } },
		);
		expect(result.candidates).toEqual([]);
		expect(result.selected).toBeUndefined();
	});

	test("passes the complete argument policy to output builders", () => {
		const grammar = compileDomainConfig({
			recipes: [
				{
					id: "policy-aware",
					root: { kind: "terminal", consumerId: "text" },
					outputBuilderId: "policy-aware",
				},
			],
		});
		const result = parseConfiguredArgument(
			"value",
			{
				grammar,
				terminals: { text: (_id, input) => ({ valid: true, value: input }) },
				policies: {
					argument: {
						enabledRecipes: ["policy-aware"],
						currencyConsumerPolicy: { allowedCurrencies: ["USD"] },
					} as unknown as CompiledArgumentPolicy,
				},
				outputBuilders: {
					"policy-aware": ({ policy }) => ({
						valid: true,
						value: policy?.currencyConsumerPolicy?.allowedCurrencies,
					}),
				},
			},
			"argument",
		);
		expect(result.selected?.canonicalValue).toEqual(["USD"]);
	});

	test("requires async concept resolution before accepting a value", async () => {
		const grammar = compileDomainConfig({
			recipes: [
				{ id: "concept", root: { kind: "terminal", consumerId: "concept" } },
			],
		});
		const runtime = {
			grammar,
			terminals: {
				concept: async (_id: string, input: string) =>
					input === "gloves"
						? { valid: true, canonicalValue: { conceptId: "inventory.gloves" } }
						: { valid: false },
			},
			policies: {
				argument: {
					path: "argument",
					policy: {},
					quantityConsumerPolicy: {},
					enabledRecipes: ["concept"],
				},
			},
		};
		const accepted = await parseConfiguredArgumentAsync(
			"gloves",
			runtime,
			"argument",
		);
		const rejected = await parseConfiguredArgumentAsync(
			"unknown",
			runtime,
			"argument",
		);
		expect(accepted.selected?.canonicalValue).toEqual({
			conceptId: "inventory.gloves",
		});
		expect(rejected.candidates).toEqual([]);
	});

	test("async built-in concept terminal rejects unresolved inventory terms", async () => {
		const grammar = compileDomainConfig({
			values: {
				quantity: {
					conceptResolver: async (term) =>
						term === "gloves" ? { conceptId: "inventory.gloves" } : undefined,
				},
			},
		});
		const terminals = createAsyncBuiltinTerminals({ grammar });
		const accepted = await terminals.concept!("concept", "gloves", {
			grammar,
			consumerId: "concept",
			input: "gloves",
		});
		const rejected = await terminals.concept!("concept", "unknown", {
			grammar,
			consumerId: "concept",
			input: "unknown",
		});
		expect(accepted.canonicalValue).toEqual({
			conceptId: "inventory.gloves",
			term: "gloves",
			rawText: "gloves",
		});
		expect(rejected.valid).toBe(false);
	});
});
