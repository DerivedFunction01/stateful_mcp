import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{ recordId: "starter.attribute-rules", kind: "attribute_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.evaluator-rules", kind: "evaluator_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
];
