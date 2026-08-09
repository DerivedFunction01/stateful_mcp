import { describe, expect, it } from "bun:test";
import { selectMacroPlacement } from "../src/macros/macro-placement";
import type { MacroDefinition } from "../src/macros/macro-definition";
import type { DocumentPlacementRef } from "../src/macros/macro-plan";

const definition: MacroDefinition = {
	macroId: "observation",
	macroName: "observation",
	version: 1,
	status: "published",
	active: true,
	root: {
		roleName: "Observation",
		targetSchema: "Observation",
		outputCellKind: "structured",
	},
	arguments: [],
	placementPolicy: {
		allowedPlacementIds: ["subjective", "objective"],
		defaultPlacementId: "subjective",
		allowFanOut: true,
	},
};

const placements: DocumentPlacementRef[] = [
	{
		placementId: "subjective",
		documentSchema: "SoapNote",
		documentPath: "subjective.presentingComplaint",
		targetSchema: "Observation",
		targetSchemaVersion: 1,
		cardinality: "one",
	},
	{
		placementId: "objective",
		documentSchema: "SoapNote",
		documentPath: "objective.clinicalObservations[]",
		targetSchema: "Observation",
		targetSchemaVersion: 1,
		cardinality: "many",
	},
];

describe("macro placement selection", () => {
	it("uses the published default when no placement is requested", () => {
		const result = selectMacroPlacement(definition, placements);
		expect(result.diagnostics).toEqual([]);
		expect(result.placement?.placementId).toBe("subjective");
	});

	it("selects an explicitly allowlisted placement", () => {
		const result = selectMacroPlacement(definition, placements, "objective");
		expect(result.diagnostics).toEqual([]);
		expect(result.placement?.documentPath).toBe("objective.clinicalObservations[]");
	});

	it("rejects a placement outside the published allowlist", () => {
		const result = selectMacroPlacement(definition, placements, "assessment");
		expect(result.placement).toBeUndefined();
		expect(result.diagnostics[0]).toContain("not allowed");
	});
});
