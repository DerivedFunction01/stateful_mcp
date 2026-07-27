import {
	createMedicationFieldRegistry,
	medicationConfig,
	medicationRouter,
} from "./field-registry/medication";
import {
	createObservationFieldRegistry,
	observationConfig,
	observationRouter,
} from "./field-registry/observation";
import {
	createDateRangeFieldRegistry,
	dateRangeConfig,
	dateRangeRouter,
} from "./field-registry/time";
import {
	createVitalsFieldRegistry,
	vitalsConfig,
	vitalsRouter,
} from "./field-registry/vitals";
import { GenericSchemaParser } from "./generic-schema-parser";
import type { SchemaParser } from "./schema-parsers";

export const schemaParserRegistryV2 = new Map<string, SchemaParser>([
	[
		"ObservationEvent",
		new GenericSchemaParser("ObservationEvent", {
			targetSchema: "ObservationEvent",
			createRegistry: createObservationFieldRegistry,
			router: observationRouter,
			preparsedContextKeys: observationConfig.preparsedContextKeys,
		}),
	],
	[
		"MedicationOrderObject",
		new GenericSchemaParser("MedicationOrderObject", {
			targetSchema: "MedicationOrderObject",
			createRegistry: createMedicationFieldRegistry,
			router: medicationRouter,
			preparsedContextKeys: medicationConfig.preparsedContextKeys,
		}),
	],
	[
		"VitalsMeasurementEvent",
		new GenericSchemaParser("VitalsMeasurementEvent", {
			targetSchema: "VitalsMeasurementEvent",
			createRegistry: createVitalsFieldRegistry,
			router: vitalsRouter,
			preparsedContextKeys: vitalsConfig.preparsedContextKeys,
		}),
	],
	[
		"ClinicalDateRange",
		new GenericSchemaParser("ClinicalDateRange", {
			targetSchema: "ClinicalDateRange",
			createRegistry: createDateRangeFieldRegistry,
			router: dateRangeRouter,
			preparsedContextKeys: dateRangeConfig.preparsedContextKeys,
		}),
	],
]);
