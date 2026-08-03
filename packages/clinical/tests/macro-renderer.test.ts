import { describe, expect, it } from "bun:test";
import type { MacroExecutionPlan } from "../src/macros/macro-plan";
import type { MacroPreview } from "../src/macros/macro-renderer";
import { renderMacroPreview } from "../src/macros/macro-renderer";

describe(" macro renderer", () => {
	it("renders a plan with concept, measurement, enum, and composite/duration ops", () => {
		const plan: MacroExecutionPlan = {
			groupId: "g1",
			scope: { kind: "clinical_document", sessionId: "s1", documentId: "n1" },
			macroDefinitions: [
				{ macroId: "m1", macroName: "observation", version: 2 },
			],
			operations: [
				{
					operationId: "op1",
					groupId: "g1",
					targetSchema: "Observation",
					targetPath: "concept",
					value: {
						kind: "concept",
						concept: { conceptId: "SNOMED::29857009", display: "Chest pain" },
					},
					rawValue: "chest pain",
					sourceLine: 1,
					evidence: [{ source: "dictionary", confidence: 1 }],
				},
				{
					operationId: "op2",
					groupId: "g1",
					targetSchema: "Observation",
					targetPath: "severity.score",
					value: {
						kind: "measurement",
						dimension: "score",
						magnitude: 120,
						unit: "mmHg",
						operator: "gte",
						isApproximate: true,
					},
					rawValue: "~>=120 mmHg",
					sourceLine: 2,
					evidence: [],
				},
				{
					operationId: "op3",
					groupId: "g1",
					targetSchema: "Observation",
					targetPath: "status",
					value: {
						kind: "enum",
						enumName: "ObservationStatus",
						value: "final",
					},
					rawValue: "final",
					sourceLine: 3,
					evidence: [],
				},
				{
					operationId: "op4",
					groupId: "g1",
					targetSchema: "Observation",
					targetPath: "effective",
					value: {
						kind: "composite",
						values: {
							duration: {
								kind: "temporal",
								temporalType: "duration",
								value: {
									kind: "duration",
									measurements: [
										{
											kind: "measurement",
											dimension: "time",
											magnitude: 3,
											unit: "hour",
										},
									],
									ordered: true,
								},
							},
						},
					},
					rawValue: "3 hours",
					sourceLine: 4,
					evidence: [],
				},
			],
			links: [],
			generatedCells: [],
			expectedVersions: [],
			fingerprint: {
				value: "fp-1",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};

		const preview: MacroPreview = renderMacroPreview(plan);

		expect(preview.groupId).toBe("g1");
		expect(preview.scopeKind).toBe("clinical_document");
		expect(preview.fingerprint).toBe("fp-1");
		expect(preview.lines).toEqual([
			"[Observation] concept = Chest pain",
			"[Observation] severity.score = ~>=120 mmHg",
			"[Observation] status = final",
			"[Observation] effective = { duration: 3 x hour }",
		]);
		expect(preview.fields).toEqual([
			{ path: "concept", label: "concept", value: "Chest pain" },
			{
				path: "severity.score",
				label: "severity.score",
				value: "~>=120 mmHg",
			},
			{ path: "status", label: "status", value: "final" },
			{
				path: "effective",
				label: "effective",
				value: "{ duration: 3 x hour }",
			},
		]);
	});
});
