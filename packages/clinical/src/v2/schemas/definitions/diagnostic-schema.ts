import { LAB_INTERPRETATION_FLAGS } from "../../../schemas/diagnostic";
import {
	MEASUREMENT_OPERATORS,
	VALUE_TYPES,
} from "../../../schemas/measurement";
import { CLINICAL_SOURCE_TYPES } from "../../../schemas/shared";
import { defineSchema } from "../schema-factory";
import {
	anatomyLocationsFields,
	dateRangeField,
	productDetailsFields,
} from "./shared-fields";

export const labPanelSchema = defineSchema({
	schema: "LabPanel",
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
		panelName: {
			path: "panelName",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		specimenType: {
			path: "specimenType",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		collectionTime: {
			path: "collectionTime",
			valueKind: "temporal",
			temporalType: "date",
			cardinality: "one",
			required: false,
		},
		resultTime: {
			path: "resultTime",
			valueKind: "temporal",
			temporalType: "date",
			cardinality: "one",
			required: false,
		},
		analytes: {
			path: "analytes",
			valueKind: "composite",
			cardinality: "many",
			required: true,
		},
		"analytes[].name": {
			path: "analytes[].name",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		"analytes[].interpretationFlag": {
			path: "analytes[].interpretationFlag",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: LAB_INTERPRETATION_FLAGS,
		},
		"analytes[].measurements": {
			path: "analytes[].measurements",
			valueKind: "measurement",
			cardinality: "many",
			required: true,
			measurement: {
				dimension: "laboratory",
				statisticalTypes: VALUE_TYPES,
				operators: MEASUREMENT_OPERATORS,
				allowsApproximate: true,
				allowsDataPointCount: true,
			},
		},
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		dateRange: {
			path: "dateRange",
			valueKind: "temporal",
			temporalType: "date_range",
			cardinality: "one",
			required: false,
		},
		notes: {
			path: "notes",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
	},
});

export const deviceDiagnosticSchema = defineSchema({
	schema: "DeviceDiagnostic",
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
		modality: {
			path: "modality",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		dicomReference: {
			path: "dicomReference",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
		interpretation: {
			path: "interpretation",
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
		findings: {
			path: "findings",
			valueKind: "concept_array",
			cardinality: "many",
			required: true,
			conceptResolution: { required: true },
		},
		...anatomyLocationsFields(),
		...productDetailsFields(),
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		...dateRangeField(),
	},
});
