export const MACRO_SCALAR_TYPES = [
	"string",
	"integer",
	"number",
	"boolean",
] as const;
export type ScalarType = (typeof MACRO_SCALAR_TYPES)[number];
export type MacroScalarType = ScalarType;

export const MACRO_VALUE_KINDS = [
	"scalar",
	"enum",
	"array",
	"composite",
	"quantity",
	"date-time",
	"custom",
] as const;
export type ValueKind = (typeof MACRO_VALUE_KINDS)[number];
export type MacroValueKind = ValueKind;

export interface NumericBounds {
	min?: number;
	max?: number;
	inclusiveMin?: boolean;
	inclusiveMax?: boolean;
}

export interface ValueEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export interface ScalarValue {
	kind: "scalar";
	scalarType: ScalarType;
	value: string | number | boolean;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface EnumValue {
	kind: "enum";
	value: string;
	metadata?: Record<string, unknown>;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface ArrayValue {
	kind: "array";
	items: GenericValue[];
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface CompositeValue {
	kind: "composite";
	values: Record<string, GenericValue>;
	rawText?: string;
}

export interface CustomValue {
	kind: "custom";
	valueKind: string;
	value: unknown;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface QuantityValue {
	kind: "quantity";
	magnitude: number;
	unit: string;
	operator?: string;
	range?: { lower: number; upper: number; unit: string };
	normalized?: { magnitude: number; unit: string };
	rawText?: string;
	evidence?: ValueEvidence[];
}

export interface DateTimeValue {
	kind: "date-time";
	value: string | Record<string, unknown>;
	rawText?: string;
	evidence?: ValueEvidence[];
}

export type GenericValue =
	| ScalarValue
	| EnumValue
	| ArrayValue
	| CompositeValue
	| CustomValue
	| QuantityValue
	| DateTimeValue;
