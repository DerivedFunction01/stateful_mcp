import {
	CADENCE_BASE_TYPES,
	PHYSIOLOGICAL_EVENT_ANCHORS,
} from "../../../schemas/medication";
import { CLINICAL_SOURCE_TYPES, LATERALITIES } from "../../../schemas/shared";
import { TIME_PRECISION_LEVELS } from "../../../schemas/time";
import type { SchemaFieldDefinition } from "../schema-factory";

/**
 * Shared, reusable schema field fragments.
 *
 * Each factory returns a `Record<path, SchemaFieldDefinition>` (key === path) so
 * it can be spread directly into a schema's `fields` object, e.g.
 *
 *   fields: { id: {...}, ...frequencyFields() }
 *
 * The `required` override controls the required flag of the composite/leaf root
 * only; nested mandatory children keep their own required semantics.
 */

export interface FieldOverrides {
	required?: boolean;
	/**
	 * Optional dotted path prefix (without trailing dot) that relocates the
	 * fragment under a nested/array parent, e.g. `base: "currentMedications[]"`
	 * produces `currentMedications[].frequency` and its children.
	 */
	base?: string;
	/**
	 * Optional leaf name override (defaults to the fragment's canonical name).
	 * e.g. a ProductIdentifier stored as `details` uses { name: "details" }.
	 */
	name?: string;
}

function joinPath(base: string | undefined, name: string): string {
	return base ? `${base}.${name}` : name;
}

/**
 * `MedicationFrequency` composite (`frequency`).
 * Used by Medication, Exposure, and History (currentMedications / socialHistory).
 */
export function frequencyFields(
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	const required = overrides.required ?? false;
	const frequency = joinPath(overrides.base, "frequency");
	return {
		[frequency]: {
			path: frequency,
			valueKind: "composite",
			cardinality: "one",
			required,
		},
		[`${frequency}.cadenceType`]: {
			path: `${frequency}.cadenceType`,
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CADENCE_BASE_TYPES,
		},
		[`${frequency}.interval`]: {
			path: `${frequency}.interval`,
			valueKind: "composite",
			cardinality: "one",
			required: false,
		},
		[`${frequency}.interval.multiplier`]: {
			path: `${frequency}.interval.multiplier`,
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: true,
		},
		[`${frequency}.interval.unit`]: {
			path: `${frequency}.interval.unit`,
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: TIME_PRECISION_LEVELS,
		},
		[`${frequency}.rate`]: {
			path: `${frequency}.rate`,
			valueKind: "composite",
			cardinality: "one",
			required: false,
		},
		[`${frequency}.rate.times`]: {
			path: `${frequency}.rate.times`,
			valueKind: "scalar",
			scalarType: "number",
			cardinality: "one",
			required: true,
		},
		[`${frequency}.rate.period`]: {
			path: `${frequency}.rate.period`,
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: TIME_PRECISION_LEVELS,
		},
		[`${frequency}.eventAnchor`]: {
			path: `${frequency}.eventAnchor`,
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: PHYSIOLOGICAL_EVENT_ANCHORS,
		},
		[`${frequency}.isPrn`]: {
			path: `${frequency}.isPrn`,
			valueKind: "scalar",
			scalarType: "boolean",
			cardinality: "one",
			required: true,
		},
		[`${frequency}.prnReason`]: {
			path: `${frequency}.prnReason`,
			valueKind: "concept",
			cardinality: "one",
			required: false,
			conceptResolution: { required: true },
		},
	};
}

/**
 * `AnatomicalLocation[]` composite (`anatomyLocations`).
 * Used by Observation, Vitals, Diagnosis, Assessment, Exposure, and Injury.
 */
export function anatomyLocationsFields(
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	const required = overrides.required ?? false;
	const anatomyLocations = joinPath(overrides.base, "anatomyLocations");
	return {
		[anatomyLocations]: {
			path: anatomyLocations,
			valueKind: "composite",
			cardinality: "many",
			required,
		},
		[`${anatomyLocations}[].anatomy`]: {
			path: `${anatomyLocations}[].anatomy`,
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true },
		},
		[`${anatomyLocations}[].laterality`]: {
			path: `${anatomyLocations}[].laterality`,
			valueKind: "enum",
			cardinality: "one",
			required: false,
			enumValues: LATERALITIES,
		},
		[`${anatomyLocations}[].depthIndex`]: {
			path: `${anatomyLocations}[].depthIndex`,
			valueKind: "scalar",
			scalarType: "integer",
			cardinality: "one",
			required: false,
			bounds: { min: 0 },
		},
	};
}

/**
 * `ProductIdentifier` composite (`productDetails`).
 * Used by DeviceDiagnostic, Environment (vehicle), and ProtectiveEquipment.
 */
export function productDetailsFields(
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	const required = overrides.required ?? false;
	const productDetails = joinPath(
		overrides.base,
		overrides.name ?? "productDetails",
	);
	return {
		[productDetails]: {
			path: productDetails,
			valueKind: "composite",
			cardinality: "one",
			required,
		},
		[`${productDetails}.manufacturer`]: {
			path: `${productDetails}.manufacturer`,
			valueKind: "concept",
			cardinality: "one",
			required: false,
			conceptResolution: { required: true },
		},
		[`${productDetails}.modelOrProductName`]: {
			path: `${productDetails}.modelOrProductName`,
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
		[`${productDetails}.modelOrProductNumber`]: {
			path: `${productDetails}.modelOrProductNumber`,
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
		[`${productDetails}.buildYear`]: {
			path: `${productDetails}.buildYear`,
			valueKind: "scalar",
			scalarType: "integer",
			cardinality: "one",
			required: false,
		},
		[`${productDetails}.registryTrackingNumber`]: {
			path: `${productDetails}.registryTrackingNumber`,
			valueKind: "scalar",
			scalarType: "string",
			cardinality: "one",
			required: false,
		},
	};
}

/**
 * `dateRange` temporal field.
 */
export function dateRangeField(
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	return {
		dateRange: {
			path: "dateRange",
			valueKind: "temporal",
			temporalType: "date_range",
			cardinality: "one",
			required: overrides.required ?? false,
		},
	};
}

/**
 * `sourceType` enum field.
 */
export function sourceTypeField(
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	return {
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: overrides.required ?? false,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
	};
}

/**
 * `soapSection` enum field. Call with the allowed section literals.
 */
export function soapSectionField(
	values: readonly string[],
	overrides: FieldOverrides = {},
): Record<string, SchemaFieldDefinition> {
	return {
		soapSection: {
			path: "soapSection",
			valueKind: "enum",
			cardinality: "one",
			required: overrides.required ?? true,
			enumValues: values,
		},
	};
}
