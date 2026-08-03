import { EXPOSURE_TYPES } from "../../../schemas/exposure";
import { CADENCE_BASE_TYPES } from "../../../schemas/medication";
import { ROUTES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";

export const exposureSchema = defineSchema({
	schema: "Exposure",
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
		exposureType: {
			path: "exposureType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: EXPOSURE_TYPES,
		},
		substance: {
			path: "substance",
			valueKind: "concept",
			cardinality: "one",
			required: false,
			conceptResolution: { required: true },
		},
		route: {
			path: "route",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: ROUTES,
		},
		dateRange: {
			path: "dateRange",
			valueKind: "temporal",
			temporalType: "date_range",
			cardinality: "one",
			required: false,
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
		side_effects: {
			path: "side_effects",
			valueKind: "composite",
			cardinality: "one",
			required: false,
		},
		"side_effects.allergic": {
			path: "side_effects.allergic",
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: false,
		},
		"side_effects.intolerant": {
			path: "side_effects.intolerant",
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: false,
		},
		"side_effects.adverse_reaction": {
			path: "side_effects.adverse_reaction",
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: false,
		},
	},
});
