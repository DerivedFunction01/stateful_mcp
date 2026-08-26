import { describe, expect, test } from "bun:test";
import {
	compileFundamentalGroups,
	extractFundamental,
	type FundamentalGroup,
} from "../src/values/fundamentals";
import { resolveOperator } from "../src/values/operators";
import { resolveStatisticalQualifier } from "../src/values/statistics";

describe("configured extraction fundamentals", () => {
	const pairedGroups: readonly FundamentalGroup[] = [
		{
			id: "range",
			variants: [
				{
					id: "from-to",
					prefix: [{ id: "from", text: "from" }],
					connectors: [[{ id: "to", text: "to" }]],
					slots: [{ id: "start" }, { id: "end" }],
				},
				{
					id: "between-and",
					prefix: [{ id: "between", text: "between" }],
					connectors: [[{ id: "and", text: "and" }]],
					slots: [{ id: "start" }, { id: "end" }],
				},
			],
		},
	];

	test("compiles explicit paired prefix and connector variants", () => {
		const result = compileFundamentalGroups(pairedGroups);
		expect(result.diagnostics).toEqual([]);
		expect(result.variants).toHaveLength(2);

		const fromTo = result.variants.find(
			(variant) => variant.variantId === "from-to",
		);
		expect(fromTo).toBeDefined();
		expect(extractFundamental("from 20 to 50", fromTo!)).toMatchObject({
			groupId: "range",
			variantId: "from-to",
			slots: { start: "20", end: "50" },
		});
	});

	test("does not infer a pairing between separate variants", () => {
		const result = compileFundamentalGroups(pairedGroups);
		const fromTo = result.variants.find(
			(variant) => variant.variantId === "from-to",
		)!;
		const betweenAnd = result.variants.find(
			(variant) => variant.variantId === "between-and",
		)!;

		expect(extractFundamental("from 20 and 50", fromTo)).toBeUndefined();
		expect(extractFundamental("between 20 to 50", betweenAnd)).toBeUndefined();
	});

	test("allows configured cross-product alternatives without repairing them", () => {
		const result = compileFundamentalGroups([
			{
				id: "range",
				variants: [
					{
						id: "independent",
						prefix: [
							{ id: "from", text: "from" },
							{ id: "between", text: "between" },
						],
						connectors: [
							[
								{ id: "to", text: "to" },
								{ id: "and", text: "and" },
							],
						],
						slots: [{ id: "start" }, { id: "end" }],
					},
				],
			},
		]);
		const variant = result.variants[0]!;

		expect(extractFundamental("from 20 and 50", variant)?.slots).toEqual({
			start: "20",
			end: "50",
		});
		expect(extractFundamental("between 20 to 50", variant)?.slots).toEqual({
			start: "20",
			end: "50",
		});
	});

	test("requires a configured connector for two slots", () => {
		const result = compileFundamentalGroups([
			{
				id: "pair",
				variants: [{ id: "bare", slots: [{ id: "left" }, { id: "right" }] }],
			},
		]);
		expect(result.variants).toHaveLength(0);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					errorCode: "FUNDAMENTAL_CONNECTOR_REQUIRED",
					messageKey: "values.fundamental.connectorRequired",
				}),
			]),
		);
	});

	test("requires complete input and never returns a partial match", () => {
		const result = compileFundamentalGroups(pairedGroups);
		const variant = result.variants[0]!;

		expect(extractFundamental("from 20 to 50 extra", variant)).toBeUndefined();
		expect(extractFundamental("from 20", variant)).toBeUndefined();
	});

	test("preserves explicit case sensitivity", () => {
		const result = compileFundamentalGroups([
			{
				id: "operator",
				variants: [
					{
						id: "strict",
						prefix: [{ id: "at-least", text: "at least", caseSensitive: true }],
						slots: [{ id: "value" }],
					},
					{
						id: "loose",
						prefix: [
							{ id: "at-least", text: "at least", caseSensitive: false },
						],
						slots: [{ id: "value" }],
					},
				],
			},
		]);

		expect(
			extractFundamental("AT LEAST 20", result.variants[0]!),
		).toBeUndefined();
		expect(
			extractFundamental("AT LEAST 20", result.variants[1]!),
		).toMatchObject({
			slots: { value: "20" },
		});
	});

	test("rejects mixed case policies within one variant instead of broadening it", () => {
		const result = compileFundamentalGroups([
			{
				id: "mixed",
				variants: [
					{
						id: "v",
						prefix: [
							{ id: "strict", text: "strict", caseSensitive: true },
							{ id: "loose", text: "loose", caseSensitive: false },
						],
						slots: [{ id: "value" }],
					},
				],
			},
		]);
		expect(result.variants).toEqual([]);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					errorCode: "FUNDAMENTAL_CONFLICTING_CASE_POLICY",
				}),
			]),
		);
	});

	test("reports duplicate groups and variants structurally", () => {
		const result = compileFundamentalGroups([
			{ id: "range", variants: [{ id: "v", slots: [{ id: "x" }] }] },
			{ id: "range", variants: [{ id: "v", slots: [{ id: "x" }] }] },
		]);

		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					errorCode: "DUPLICATE_FUNDAMENTAL_GROUP",
					messageKey: "values.fundamental.duplicateGroup",
				}),
			]),
		);
		for (const item of result.diagnostics) {
			expect(item).not.toHaveProperty("message");
			expect(item.messageKey).toBeTruthy();
		}
	});

	test("operator and statistic aliases honor the shared case toggle", () => {
		expect(
			resolveOperator("AT LEAST", {
				prefixAliases: { greater_equal: ["at least"] },
				caseSensitive: true,
			})?.operator,
		).toBeUndefined();
		expect(
			resolveOperator("AT LEAST", {
				prefixAliases: { greater_equal: ["at least"] },
				caseSensitive: false,
			})?.operator,
		).toBe("greater_equal");
		expect(
			resolveStatisticalQualifier("AVERAGE", {
				qualifiers: { mean: ["average"] },
				caseSensitive: true,
			}).qualifier,
		).toBeUndefined();
		expect(
			resolveStatisticalQualifier("AVERAGE", {
				qualifiers: { mean: ["average"] },
				caseSensitive: false,
			}).qualifier?.type,
		).toBe("mean");
	});
});
