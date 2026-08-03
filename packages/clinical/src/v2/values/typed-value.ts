/**
 * V2 typed value contracts.
 *
 * These are pure type contracts shared by macro definitions, macro planning,
 * and execution. They are intentionally decoupled from the retired CDSL /
 * `ParsedItem` value model. No runtime code or legacy parser imports exist here.
 */

import type { CodeableConcept } from "../../schemas/shared";
import type {
	MeasurementOperator,
	ValueType,
} from "../../schemas/measurement";
import type { MedicationFrequency } from "../../schemas/medication";
import type { ClinicalDateRange, TimePrecisionLevel } from "../../schemas/time";

export interface NumericBounds {
	min?: number;
	max?: number;
	inclusiveMin?: boolean;
	inclusiveMax?: boolean;
}

export type TypedValueKind =
	| "concept"
	| "concept_array"
	| "scalar"
	| "enum"
	| "measurement"
	| "temporal"
	| "array"
	| "composite";

/** A canonical clinical concept, resolved through the dictionary service. */
export interface ConceptValue {
	kind: "concept";
	concept: CodeableConcept;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface ConceptArrayValue {
	kind: "concept_array";
	concepts: CodeableConcept[];
	rawText?: string;
	mergeStrategy: "append" | "replace";
	evidence?: ValueEvidence[];
}

export type ScalarType = "string" | "integer" | "number" | "boolean" | "custom";

export interface ScalarValue {
	kind: "scalar";
	scalarType: ScalarType;
	value: string | number | boolean;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface EnumValue {
	kind: "enum";
	enumName?: string;
	value: string;
	rawText?: string;
	aliases?: string[];
	evidence?: ValueEvidence[];
}

export interface MeasurementValue {
	kind: "measurement";
	dimension: string;
	magnitude: number;
	unit: string;
	statisticalType?: ValueType;
	operator?: MeasurementOperator;
	isApproximate?: boolean;
	dataPointCount?: number;
	/** Value normalized to the dimension's canonical base unit, when known. */
	normalized?: { magnitude: number; unit: string };
	rawText?: string;
	evidence?: ValueEvidence[];
}

export type TemporalValueType =
	| "duration"
	| "date"
	| "date_range"
	| "relative_time"
	| "cadence";

export interface DurationTemporalPayload {
	kind: "duration";
	measurements: MeasurementValue[];
	ordered: true;
}

export interface DateTemporalPayload {
	kind: "date";
	value: string;
	precision?: TimePrecisionLevel;
}

export interface DateRangeTemporalPayload {
	kind: "date_range";
	value: ClinicalDateRange;
}

export interface RelativeTimeTemporalPayload {
	kind: "relative_time";
	direction: "retrospective" | "prospective" | "static_approximate";
	amount: number;
	unit: TimePrecisionLevel;
}

export interface CadenceTemporalPayload {
	kind: "cadence";
	value: MedicationFrequency;
}

export type TemporalValuePayload =
	| string
	| DurationTemporalPayload
	| DateTemporalPayload
	| DateRangeTemporalPayload
	| RelativeTimeTemporalPayload
	| CadenceTemporalPayload;

export interface TemporalValue {
	kind: "temporal";
	temporalType: TemporalValueType;
	value: TemporalValuePayload;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface ArrayValue {
	kind: "array";
	itemKind: TypedValueKind;
	items: TypedValue[];
	itemDelimiter?: string;
	mergeStrategy: "append" | "replace";
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface CompositeValue {
	kind: "composite";
	values: Record<string, TypedValue>;
	rawText?: string;
}

export type TypedValue =
	| ConceptValue
	| ConceptArrayValue
	| ScalarValue
	| EnumValue
	| MeasurementValue
	| TemporalValue
	| ArrayValue
	| CompositeValue;

export interface ValueEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export function valueKind(value: TypedValue): TypedValueKind {
	return value.kind;
}
