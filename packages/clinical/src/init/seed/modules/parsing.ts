import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{ recordId: "starter.attribute-rules", kind: "attribute_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.evaluator-rules", kind: "evaluator_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.field-rules", kind: "field_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.concept-defaults", kind: "concept_default", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
];
