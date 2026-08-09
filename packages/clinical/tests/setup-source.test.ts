import { describe, expect, it } from "bun:test";
import {
	createDefaultSetupSource,
	compileSetupMacro,
	expandSetupPlacements,
	MemorySetupSourceStore,
	validateSetupSource,
} from "../src/setup";

describe("interactive setup source", () => {
	it("round-trips a draft through the source store", async () => {
		const store = new MemorySetupSourceStore();
		const source = createDefaultSetupSource("draft-1");
		await store.set(source);

		expect(await store.get("draft-1")).toEqual(source);
		expect(await store.list()).toHaveLength(1);
	});

	it("validates block and placement references before publication", () => {
		const source = createDefaultSetupSource("invalid");
		source.macros.push({
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: ["missing-placement"],
			parameters: [{ argumentId: "concept", blockId: "missing-block" }],
			status: "draft",
		});

		const result = validateSetupSource(source);

		expect(result.valid).toBe(false);
		expect(result.diagnostics.map((item) => item.code)).toEqual([
			"missing_macro_placement",
			"missing_macro_block",
		]);
	});

	it("compiles selected blocks into the existing macro contract", () => {
		const source = createDefaultSetupSource("compile");
		source.blocks.push({
			blockId: "concept-pneumonia",
			version: 1,
			label: "pneumonia",
			kind: "concept",
			target: { targetSchema: "ObservationEvent", targetPath: "concept" },
			valueKind: "concept",
			source: { kind: "concept", conceptId: "c-pneumonia" },
			schemaVersion: 1,
			status: "draft",
		});
		source.macros.push({
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: [],
			parameters: [{ argumentId: "concept", blockId: "concept-pneumonia" }],
			status: "draft",
		});

		const macro = compileSetupMacro(source.macros[0]!, source.blocks);

		expect(macro.arguments[0]).toMatchObject({
			argumentId: "concept",
			roleName: "ObservationEvent.concept",
			target: { targetPath: "concept" },
		});
	});

	it("expands only explicitly enabled fan-out placements", () => {
		const source = createDefaultSetupSource("fan-out");
		source.placements.push(
			{
				placementId: "subjective",
				documentSchema: "SoapNote",
				documentVersion: 1,
				documentPath: "subjective.presentingComplaint",
				targetSchema: "ObservationEvent",
				targetSchemaVersion: 1,
				cardinality: "one",
			},
			{
				placementId: "objective",
				documentSchema: "SoapNote",
				documentVersion: 1,
				documentPath: "objective.clinicalObservations[]",
				targetSchema: "ObservationEvent",
				targetSchemaVersion: 1,
				cardinality: "many",
			},
		);
		const composition = {
			macroId: "observation",
			version: 1,
			macroName: "observation",
			targetSchema: "ObservationEvent",
			targetSchemaVersion: 1,
			allowedPlacementIds: ["subjective", "objective"],
			defaultPlacementId: "subjective",
			parameters: [
				{ argumentId: "concept", blockId: "concept", placementMode: "fan_out" as const },
				{ argumentId: "certainty", blockId: "certainty" },
			],
			status: "draft" as const,
		};

		const operations = expandSetupPlacements(composition, source.placements);

		expect(operations.map((operation) => operation.placementId)).toEqual([
			"subjective",
			"objective",
			"subjective",
		]);
	});
});
