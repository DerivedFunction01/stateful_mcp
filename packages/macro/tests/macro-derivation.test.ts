import { describe, expect, test } from "bun:test";
import { deriveMacroAdapter } from "../src/composition/derivation";
import type { MacroChildBinding, MacroDefinitionAdapter } from "../src/contracts/composition";
import type { MacroInput } from "../src/contracts/input";

describe("Macro Derivation & Schema Invariance (deriveMacroAdapter)", () => {
	// Base Macro: Full Verbose Clinical Rule-Out
	const baseRuleOutAdapter: MacroDefinitionAdapter = {
		definition: {
			id: "macro:rule-out",
			name: "rule-out",
			arguments: [
				{
					argumentId: "condition",
					name: "condition",
					path: "rule-out.condition",
					matcher: { kind: "pattern", pattern: "#[\\w\\-]+" },
					required: true,
				},
				{
					argumentId: "rationale",
					name: "rationale",
					path: "rule-out.rationale",
					matcher: { kind: "pattern", pattern: "[\\w\\-\\s]+" },
					required: false,
				},
				{
					argumentId: "confidence",
					name: "confidence",
					path: "rule-out.confidence",
					matcher: { kind: "pattern", pattern: "\\d+%" },
					required: false,
				},
			],
		},
		previewTemplate: {
			version: 1,
			parts: [
				{ kind: "literal", text: "rule-out " },
				{ kind: "slot", argumentId: "condition", occurrence: 0 },
			],
		},
		children: {
			condition: {
				type: "concept",
				validate: ({ input }) => ({
					status: "accepted",
					binding: { canonicalValue: { conceptId: input.rawValue.replace(/^#/, "") } },
				}),
			},
			rationale: {
				type: "string",
				validate: ({ input }) => ({
					status: "accepted",
					binding: { canonicalValue: input.rawValue.trim() },
				}),
			},
			confidence: {
				type: "percentage",
				validate: ({ input }) => ({
					status: "accepted",
					binding: { canonicalValue: parseFloat(input.rawValue) },
				}),
			},
		},
		compile: async (bindings: readonly MacroChildBinding[], input: MacroInput) => {
			const cond = input.arguments.find((a) => a.name === "condition" || a.match?.argumentId === "condition");
			const rat = input.arguments.find((a) => a.name === "rationale" || a.match?.argumentId === "rationale");
			const conf = input.arguments.find((a) => a.name === "confidence" || a.match?.argumentId === "confidence");

			return {
				kind: "rule_out_assertion",
				condition: cond ? cond.rawValue.replace(/^#/, "") : "unspecified",
				rationale: rat ? rat.rawValue.trim() : "clinical judgment",
				confidence: conf ? parseFloat(conf.rawValue) : 100,
				timestamp: "2026-08-16T12:00:00Z",
			};
		},
	};

	test("derives a concise shorthand macro that reuses base compile logic and child validators", async () => {
		const conciseRoAdapter = deriveMacroAdapter(baseRuleOutAdapter, {
			macroName: "ro",
			description: "Quick rule out with condition only",
			arguments: [
				{
					argumentId: "condition",
					name: "condition",
					path: "ro.condition",
					matcher: { kind: "pattern", pattern: "#[\\w\\-]+" },
					required: true,
				},
			],
		});

		expect(conciseRoAdapter.definition.name).toBe("ro");
		expect(conciseRoAdapter.definition.arguments).toHaveLength(1);
		expect(conciseRoAdapter.children.condition).toBeDefined();

		const mockInput: MacroInput = {
			macroName: "ro",
			sourceLines: [{ line: 1, raw: "^ro #pulmonary-embolism" }],
			arguments: [
				{
					name: "condition",
					rawValue: "#pulmonary-embolism",
					source: "named",
				},
			],
			matches: [],
		};

		const compiled = await conciseRoAdapter.compile!([], mockInput);
		expect(compiled).toEqual({
			kind: "rule_out_assertion",
			condition: "pulmonary-embolism",
			rationale: "clinical judgment",
			confidence: 100,
			timestamp: "2026-08-16T12:00:00Z",
		});
	});

	test("supports mapBindings to project derived slots and inject defaults into base macro execution", async () => {
		const highConfidenceRoAdapter = deriveMacroAdapter(baseRuleOutAdapter, {
			macroName: "definite-ro",
			description: "Definite rule out with explicit rationale",
			arguments: [
				{
					argumentId: "condition",
					name: "condition",
					path: "definite-ro.condition",
					matcher: { kind: "pattern", pattern: "#[\\w\\-]+" },
					required: true,
				},
				{
					argumentId: "evidence",
					name: "evidence",
					path: "definite-ro.evidence",
					matcher: { kind: "pattern", pattern: "[\\w\\-\\s]+" },
					required: true,
				},
			],
			mapBindings: (_derivedBindings, derivedInput) => {
				const condInput = derivedInput.arguments.find((a) => a.name === "condition");
				const evInput = derivedInput.arguments.find((a) => a.name === "evidence");

				const projectedArgs = [
					condInput ?? { name: "condition", rawValue: "#unknown", source: "named" as const },
					{
						name: "rationale",
						rawValue: `Confirmed by evidence: ${evInput?.rawValue ?? "none"}`,
						source: "named" as const,
					},
					{ name: "confidence", rawValue: "99.9%", source: "named" as const },
				];

				return {
					baseBindings: [],
					baseInput: {
						...derivedInput,
						macroName: "rule-out",
						arguments: projectedArgs,
					},
				};
			},
		});

		const mockInput: MacroInput = {
			macroName: "definite-ro",
			sourceLines: [{ line: 1, raw: "^definite-ro #dvt evidence negative-ultrasound" }],
			arguments: [
				{ name: "condition", rawValue: "#dvt", source: "named" },
				{ name: "evidence", rawValue: "negative-ultrasound", source: "named" },
			],
			matches: [],
		};

		const compiled = await highConfidenceRoAdapter.compile!([], mockInput);
		expect(compiled).toEqual({
			kind: "rule_out_assertion",
			condition: "dvt",
			rationale: "Confirmed by evidence: negative-ultrasound",
			confidence: 99.9,
			timestamp: "2026-08-16T12:00:00Z",
		});
	});

	test("allows overriding specific child handlers while preserving remaining base children", async () => {
		const customChildAdapter = deriveMacroAdapter(baseRuleOutAdapter, {
			macroName: "custom-ro",
			overrideChildren: {
				condition: {
					type: "custom-concept",
					validate: ({ input }) => ({
						status: "accepted",
						binding: {
							canonicalValue: {
								conceptId: `custom:${input.rawValue.replace(/^#/, "")}`,
								overridden: true,
							},
						},
					}),
				},
			},
		});

		const validated = await customChildAdapter.children.condition?.validate({
			text: "#asthma",
			input: { name: "condition", rawValue: "#asthma", source: "named" },
			definition: customChildAdapter.definition,
			candidates: [],
		});

		expect(validated?.binding?.canonicalValue).toEqual({
			conceptId: "custom:asthma",
			overridden: true,
		});
	});
});
