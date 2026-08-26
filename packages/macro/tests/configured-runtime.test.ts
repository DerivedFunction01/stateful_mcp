import { describe, expect, test } from "bun:test";
import { ExtensionRuntime } from "../src/extensions/runtime";
import { createMacroRuntimeContext } from "../src/contracts/context";

describe("configured value runtime", () => {
	test("scopes extension terminals and rejects unavailable recipe terminals", async () => {
		const runtime = new ExtensionRuntime({
			context: createMacroRuntimeContext({ macroStartToken: "^" }),
		});
		const adapter = {
			definition: {
				id: "custom-value-macro",
				name: "custom-value",
				arguments: [
					{
						argumentId: "value",
						name: "value",
						path: "value",
						configuredValue: { consumerId: "custom-number" },
					},
				],
			},
			previewTemplate: { version: 1 as const, parts: [] },
			children: {
				value: {
					type: "custom-value",
					validate: (context: any) => ({
						status: "accepted" as const,
						binding: {
							canonicalValue: context.input.match?.canonicalValue,
							recipeId: context.input.match?.recipeId,
						},
					}),
				},
			},
			compile: (bindings: readonly any[]) => bindings[0]?.binding,
		};

		const extension = {
			manifest: {
				id: "custom-values",
				name: "Custom Values",
				version: "1.0.0",
				domainConfig: {
					fundamentals: [
						{
							id: "wrapped-number",
							variants: [
								{
									id: "value",
									prefix: [{ id: "prefix", text: "value" }],
									slots: [{ id: "number", pattern: "\\d+" }],
								},
							],
						},
					],
					recipes: [
						{
							id: "custom-number-recipe",
							root: {
								kind: "fundamental",
								groupId: "wrapped-number",
								children: [{ kind: "terminal", consumerId: "custom-number" }],
							},
						},
					],
					macros: {
						"custom-value": {
							arguments: {
								value: { enabledRecipes: ["custom-number-recipe"] },
							},
						},
					},
				},
				contributes: {},
			},
			activate: (context: any) => {
				context.values.registerTerminal(
					"custom-number",
					(_id: string, input: string) => ({
						valid: /^\d+$/u.test(input),
						canonicalValue: Number(input),
					}),
				);
				return { adapters: [adapter] };
			},
		};

		const activation = await runtime.activate([
			{
				sourceFile: "/ext/custom-values/index.ts",
				extension: extension as any,
			},
		]);
		expect(activation.diagnostics).toEqual([]);

		const draft = await runtime.parseAdapter(
			"custom-value-macro",
			"^custom-value value=value 42",
		);
		expect(draft.input?.matches[0]).toMatchObject({
			source: "configured",
			canonicalValue: 42,
			recipeId: "custom-number-recipe",
		});

		runtime.applyProfile({ locale: "fr-FR" });
		await expect(
			runtime.executeAdapter("custom-value-macro", draft),
		).rejects.toThrow("configured values are stale");
	});
});
