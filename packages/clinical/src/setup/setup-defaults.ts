import type { SetupSourceDocument } from "./setup-types";

export function createDefaultSetupSource(
	sourceId = "default-clinical-setup",
): SetupSourceDocument {
	return {
		format: "stateful-clinical-setup",
		formatVersion: 1,
		sourceId,
		profileId: "default-clinical",
		profileVersion: 1,
		primitiveProfile: {
			profileId: "default-clinical-primitives",
			version: 1,
			dateExamples: [],
			timeExamples: [],
			measurementExamples: [],
			temporalAliases: {},
			unitAliases: {},
		},
		concepts: [],
		expressions: [],
		conceptFilters: [],
		targetAliases: [],
		placements: [],
		blocks: [],
		macros: [],
		updatedAt: new Date(0).toISOString(),
	};
}
