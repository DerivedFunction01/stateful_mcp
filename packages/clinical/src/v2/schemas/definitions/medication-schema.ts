import { CADENCE_BASE_TYPES } from "../../../schemas/medication";
import { ROUTES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";

export const medicationSchema = defineSchema({
	schema: "Medication",
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
		medication: {
			path: "medication",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		rawTerm: {
			path: "rawTerm",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
		dosage: {
			path: "dosage",
			valueKind: "measurement",
			cardinality: "one",
			required: false,
			measurement: {
				dimension: "mass_concentration",
			},
		},
		count: {
			path: "count",
			valueKind: "measurement",
			cardinality: "one",
			required: false,
			measurement: {
				dimension: "count",
			},
		},
		frequency: {
			path: "frequency",
			valueKind: "composite",
			cardinality: "one",
			required: false,
		},
		"frequency.cadenceType": {
			path: "frequency.cadenceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CADENCE_BASE_TYPES,
		},
		route: {
			path: "route",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: ROUTES,
		},
		quantityToDispense: {
			path: "quantityToDispense",
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: false,
			bounds: { min: 0 },
		},
		authorizedRefills: {
			path: "authorizedRefills",
			valueKind: "scalar",
			scalarType: "integer",
			cardinality: "one",
			required: true,
			bounds: { min: 0 },
		},
		genericSubstitutionPermitted: {
			path: "genericSubstitutionPermitted",
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: true,
		},
		targetIndication: {
			path: "targetIndication",
			valueKind: "concept",
			cardinality: "one",
			required: false,
			conceptResolution: { required: true },
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
