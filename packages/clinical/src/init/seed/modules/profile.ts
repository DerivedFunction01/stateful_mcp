import type { ClinicalInitSeedRecord } from "../record";

export const records: ClinicalInitSeedRecord[] = [
	{
		recordId: "starter.profile",
		kind: "profile",
		profileId: "starter.default",
		payload: { tagToken: "#", stateDelimiter: "||", languageValuesRequired: true },
	},
];
