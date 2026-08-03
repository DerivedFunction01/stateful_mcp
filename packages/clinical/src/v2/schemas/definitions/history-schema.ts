import {
	ALLERGY_VERIFICATION_STATUSES,
	COMPLIANCE_STATUSES,
	SOCIAL_HISTORY_STATUSES,
} from "../../../schemas/history";
import { CLINICAL_SOURCE_TYPES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";

export const historySchema = defineSchema({
	schema: "History",
	version: 1,
	status: "published",
	fields: {
		pastMedicalHistory: {
			path: "pastMedicalHistory",
			valueKind: "concept_array",
			cardinality: "many",
			required: true,
			conceptResolution: { required: true },
		},
		currentMedications: {
			path: "currentMedications",
			valueKind: "composite",
			cardinality: "many",
			required: true,
		},
		"currentMedications[].medication": {
			path: "currentMedications[].medication",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		"currentMedications[].complianceStatus": {
			path: "currentMedications[].complianceStatus",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: COMPLIANCE_STATUSES,
		},
		"currentMedications[].sourceType": {
			path: "currentMedications[].sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		allergies: {
			path: "allergies",
			valueKind: "composite",
			cardinality: "many",
			required: true,
		},
		"allergies[].substance": {
			path: "allergies[].substance",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		"allergies[].verificationStatus": {
			path: "allergies[].verificationStatus",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ALLERGY_VERIFICATION_STATUSES,
		},
		familyHistory: {
			path: "familyHistory",
			valueKind: "concept_array",
			cardinality: "many",
			required: false,
			conceptResolution: { required: true },
		},
		socialHistory: {
			path: "socialHistory",
			valueKind: "composite",
			cardinality: "many",
			required: false,
		},
		"socialHistory[].status": {
			path: "socialHistory[].status",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: SOCIAL_HISTORY_STATUSES,
		},
		immunizations: {
			path: "immunizations",
			valueKind: "concept_array",
			cardinality: "many",
			required: false,
			conceptResolution: { required: true },
		},
		surgicalHistory: {
			path: "surgicalHistory",
			valueKind: "concept_array",
			cardinality: "many",
			required: false,
			conceptResolution: { required: true },
		},
	},
});
