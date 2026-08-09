import { describe, expect, it } from "bun:test";
import {
	expandMacroOperationsByPlacement,
	type MacroTargetOperation,
} from "../src/macros/macro-plan";

const operation: MacroTargetOperation = {
	operationId: "op-1",
	groupId: "group-1",
	macroDefinitionId: "observation",
	targetSchema: "Observation",
	targetPath: "concept",
	value: { kind: "scalar", scalarType: "string", value: "pneumonia" },
	rawValue: "pneumonia",
	sourceLine: 1,
	evidence: [],
};

const placement = (placementId: string) => ({
	placementId,
	documentSchema: "SoapNote",
	documentPath: placementId,
	targetSchema: "Observation",
	targetSchemaVersion: 1,
	cardinality: "many" as const,
});

describe("macro placement policy", () => {
	it("rejects an unauthorized placement", () => {
		expect(() =>
			expandMacroOperationsByPlacement(
				[operation],
				[placement("objective")],
				{ allowedPlacementIds: ["subjective"], allowFanOut: false },
			),
		).toThrow("not allowed");
	});

	it("rejects fan-out unless explicitly enabled", () => {
		expect(() =>
			expandMacroOperationsByPlacement(
				[operation],
				[placement("subjective"), placement("objective")],
				{ allowedPlacementIds: ["subjective", "objective"], allowFanOut: false },
			),
		).toThrow("does not allow fan-out");
	});

	it("expands an allowlisted fan-out", () => {
		const operations = expandMacroOperationsByPlacement(
			[operation],
			[placement("subjective"), placement("objective")],
			{ allowedPlacementIds: ["subjective", "objective"], allowFanOut: true },
		);

		expect(operations).toHaveLength(2);
		expect(operations.map((item) => item.placement?.placementId)).toEqual([
			"subjective",
			"objective",
		]);
	});
});
