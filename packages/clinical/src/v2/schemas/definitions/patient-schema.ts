import {
	ADMINISTRATIVE_GENDERS,
	SUBJECT_LIFECYCLE_STATUSES,
} from "../../../schemas/patient";
import { defineSchema } from "../schema-factory";

export const patientSchema = defineSchema({
	schema: "Patient",
	version: 1,
	status: "published",
	fields: {
		id: {
			path: "id",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		mrn: {
			path: "mrn",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		name: {
			path: "name",
			valueKind: "composite",
			cardinality: "one",
			required: true,
		},
		"name.primaryOrSurname": {
			path: "name.primaryOrSurname",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		"name.givenNames": {
			path: "name.givenNames",
			valueKind: "composite",
			cardinality: "many",
			required: false,
		},
		administrativeGender: {
			path: "administrativeGender",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ADMINISTRATIVE_GENDERS,
		},
		lifecycle: {
			path: "lifecycle",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: SUBJECT_LIFECYCLE_STATUSES,
		},
		originationDate: {
			path: "originationDate",
			valueKind: "temporal",
			temporalType: "date",
			cardinality: "one",
			required: true,
		},
		isOriginationEstimated: {
			path: "isOriginationEstimated",
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: true,
		},
		biologicalProfile: {
			path: "biologicalProfile",
			valueKind: "composite",
			cardinality: "one",
			required: true,
		},
		"biologicalProfile.organismType": {
			path: "biologicalProfile.organismType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ["human", "animal", "plant"],
		},
	},
});
