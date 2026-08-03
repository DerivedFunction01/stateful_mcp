import { CONTEXT_TYPES } from "../../../schemas/environment";
import { CLINICAL_SOURCE_TYPES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";

export const environmentSchema = defineSchema({
	schema: "Environment",
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
		soapSection: {
			path: "soapSection",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: ["subjective", "objective"],
		},
		contextType: {
			path: "contextType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CONTEXT_TYPES,
		},
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		dateRange: {
			path: "dateRange",
			valueKind: "temporal",
			temporalType: "date_range",
			cardinality: "one",
			required: false,
		},
	},
});
