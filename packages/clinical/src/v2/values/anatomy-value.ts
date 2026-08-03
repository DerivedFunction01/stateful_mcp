import type { AnatomicalLocation, Laterality } from "../../schemas/shared";
import type { CodeableConcept } from "../../schemas/shared";

export interface AnatomyValueInput {
	anatomy: CodeableConcept;
	laterality?: Laterality;
	depthIndex?: number;
}

export function createAnatomyValue(input: AnatomyValueInput): AnatomicalLocation {
	if (input.depthIndex !== undefined && (!Number.isInteger(input.depthIndex) || input.depthIndex < 0)) {
		throw new Error("Anatomy depthIndex must be a non-negative integer");
	}
	return {
		anatomy: { ...input.anatomy },
		laterality: input.laterality,
		depthIndex: input.depthIndex,
	};
}
