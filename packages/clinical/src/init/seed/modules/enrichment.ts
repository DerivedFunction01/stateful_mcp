import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{ recordId: "starter.prose-rules", kind: "prose_rule", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.shared-field-anchors", kind: "shared_field_anchor", profileId: "starter.default", requires: ["starter.profile"], payload: { rules: [] } },
	{ recordId: "starter.stop-word-list", kind: "stop_word_list", profileId: "starter.default", requires: ["starter.profile"], payload: { words: [] } },
	{ recordId: "starter.stop-word-profile", kind: "stop_word_profile", profileId: "starter.default", requires: ["starter.stop-word-list"], payload: { wordListIds: [] } },
];
