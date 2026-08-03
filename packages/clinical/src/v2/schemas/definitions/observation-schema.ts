import {
	MEASUREMENT_OPERATORS,
	VALUE_TYPES,
} from "../../../schemas/measurement";
import { OBSERVATION_TRAJECTORIES } from "../../../schemas/observation";
import {
	CERTAINTIES,
	CLINICAL_SOURCE_TYPES,
	LATERALITIES,
	STATUSES,
} from "../../../schemas/shared";
import { TIME_PRECISION_LEVELS } from "../../../schemas/time";
import { defineSchema } from "../schema-factory";

export const observationSchema = defineSchema({
	schema: "Observation",
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
		concept: {
			path: "concept",
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
			required: true,
		},
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		certainty: {
			path: "certainty",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: CERTAINTIES,
		},
		status: {
			path: "status",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: STATUSES,
		},
		severity: {
			path: "severity",
			valueKind: "composite",
			cardinality: "one",
			required: true,
		},
		"severity.score": {
			path: "severity.score",
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: true,
		},
		"severity.maxScore": {
			path: "severity.maxScore",
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: true,
		},
		"severity.normalizedScore": {
			path: "severity.normalizedScore",
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: true,
			bounds: { min: 0, max: 1 },
		},
		duration: {
			path: "duration",
			valueKind: "measurement",
			cardinality: "many",
			required: true,
			measurement: {
				dimension: "time",
				allowedUnits: TIME_PRECISION_LEVELS,
				statisticalTypes: VALUE_TYPES,
				operators: MEASUREMENT_OPERATORS,
				allowsApproximate: true,
				allowsDataPointCount: true,
			},
		},
		trajectory: {
			path: "trajectory",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: OBSERVATION_TRAJECTORIES,
		},
		qualifiers: {
			path: "qualifiers",
			valueKind: "concept_array",
			cardinality: "many",
			required: false,
			conceptResolution: { required: true },
		},
		anatomyLocations: {
			path: "anatomyLocations",
			valueKind: "composite",
			cardinality: "many",
			required: false,
		},
		"anatomyLocations[].anatomy": {
			path: "anatomyLocations[].anatomy",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		"anatomyLocations[].laterality": {
			path: "anatomyLocations[].laterality",
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: LATERALITIES,
		},
		"anatomyLocations[].depthIndex": {
			path: "anatomyLocations[].depthIndex",
			valueKind: "scalar",
			scalarType: "integer",
			cardinality: "one",
			required: false,
			bounds: { min: 0 },
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
