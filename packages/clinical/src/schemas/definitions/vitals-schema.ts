import { defineSchema } from "../schema-factory";
import {
	MEASUREMENT_OPERATORS,
	VALUE_TYPES,
} from "../schemas-interface/measurement";
import { CLINICAL_SOURCE_TYPES } from "../schemas-interface/shared";
import { anatomyLocationsFields } from "./shared-fields";

export const vitalsSchema = defineSchema({
	schema: "Vitals",
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
		category: {
			path: "category",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: true,
		},
		vitalType: {
			path: "vitalType",
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
		measurement: {
			path: "measurement",
			valueKind: "measurement",
			cardinality: "one",
			required: true,
			measurement: {
				dimension: "vital_sign",
				statisticalTypes: VALUE_TYPES,
				operators: MEASUREMENT_OPERATORS,
				allowsApproximate: true,
				allowsDataPointCount: true,
			},
		},
		...anatomyLocationsFields(),
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
