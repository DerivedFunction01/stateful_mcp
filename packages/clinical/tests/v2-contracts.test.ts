import { describe, expect, it } from "bun:test";
import type {
	CellIntent,
	MacroIntent,
	NarrativeIntent,
	WorkspaceCommandIntent,
} from "../src/v2/cells/cell-intent";
import type { StructuredCell } from "../src/v2/cells/structured-cell";
import type { MacroExecutionPlan } from "../src/v2/macros/macro-plan";
import { valueKind } from "../src/v2/values/typed-value";
import type {
	ConceptValue,
	MeasurementValue,
	TypedValue,
} from "../src/v2/values/typed-value";

describe("V2 structured cell contract", () => {
	it("satisfies the StructuredCell shape", () => {
		const cell: StructuredCell = {
			cellId: "cell_1",
			sessionId: "session_1",
			collection: { kind: "notebook", collectionId: "nb_1" },
			source: {
				origin: "user",
				createdAt: "2026-08-03T00:00:00.000Z",
				updatedAt: "2026-08-03T00:00:00.000Z",
			},
			authored: {
				rawText: "^observation concept=chest pain",
			},
			lifecycle: {
				status: "draft",
				revision: 0,
			},
			execution: {},
			provenance: {},
			relationships: {},
			diagnostics: [],
		};
		expect(cell.lifecycle.status).toBe("draft");
		expect(cell.provenance.macroDefinitionId).toBeUndefined();
	});

	it("rejects invalid lifecycle status at type level", () => {
		// Type-only guard: a status not in the union must not be assignable.
		const cell: StructuredCell = {
			cellId: "c",
			sessionId: "s",
			collection: { kind: "workspace", collectionId: "w" },
			source: {
				origin: "system",
				createdAt: "t",
				updatedAt: "t",
			},
			authored: { rawText: "" },
			// @ts-expect-error - invalid lifecycle status
			lifecycle: { status: "parsing", revision: 0 },
			execution: {},
			provenance: {},
			relationships: {},
			diagnostics: [],
		};
		void cell;
	});
});

describe("V2 cell intent union", () => {
	it("discriminates macro / workspace / narrative intents", () => {
		const macro: MacroIntent = {
			kind: "macro",
			macroName: "observation",
			arguments: [{ name: "concept", rawValue: "chest pain" }],
			sourceLines: [{ line: 1, raw: "^observation concept=chest pain" }],
		};
		const ws: WorkspaceCommandIntent = {
			kind: "workspace_command",
			command: { verb: "confirm", branchRef: "b1" },
		};
		const narr: NarrativeIntent = {
			kind: "narrative",
			target: { schema: "Note", path: "historyOfPresentIllness.narrative" },
			value: "text",
		};
		const intents: CellIntent[] = [macro, ws, narr];
		expect(intents.map((i) => i.kind)).toEqual([
			"macro",
			"workspace_command",
			"narrative",
		]);
	});
});

describe("V2 macro plan contract", () => {
	it("carries scope, operations, links, versions, and fingerprint", () => {
		const value: ConceptValue = {
			kind: "concept",
			concept: { conceptId: "SNOMED::29857009", display: "Chest pain" },
		};
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
					value,
					rawValue: "chest pain",
					sourceLine: 1,
					evidence: [{ source: "dictionary", confidence: 1 }],
				},
			],
			links: [],
			generatedCells: [],
			expectedVersions: [
				{ aggregateKind: "document", aggregateId: "n1", expectedVersion: 5 },
			],
			fingerprint: {
				value: "abc",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};
		expect(plan.operations[0]!.value.kind).toBe("concept");
		expect(plan.fingerprint.value).toBe("abc");
	});
});

describe("V2 typed value union", () => {
	it("discriminates measurement value kind", () => {
		const measurement: MeasurementValue = {
			kind: "measurement",
			dimension: "pressure",
			magnitude: 120,
			unit: "mmHg",
			statisticalType: "mean",
			operator: "gte",
			isApproximate: false,
			dataPointCount: 1,
		};
		expect(valueKind(measurement)).toBe("measurement");
	});

	it("accepts a typed value union", () => {
		const values: TypedValue[] = [
			{ kind: "scalar", scalarType: "integer", value: 7 },
			{ kind: "enum", value: "severe" },
			{ kind: "temporal", temporalType: "duration", value: "2 hours" },
		];
		expect(values).toHaveLength(3);
	});
});
