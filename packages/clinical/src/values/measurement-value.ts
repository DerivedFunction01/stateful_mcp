import type {
	MeasurementOperator,
	ValueType,
} from "../schemas/schemas-interface/measurement";
import {
	type MeasurementResolverDiagnostic,
	validateMeasurementConstraints,
} from "./measurement-resolver";
import type { QuantityGrammarResult } from "./quantity-grammar";
import type { CompositeValue, MeasurementValue } from "./typed-value";

export interface MeasurementValueInput {
	dimension: string;
	magnitude: number;
	unit: string;
	statisticalType?: ValueType;
	operator?: MeasurementOperator;
	isApproximate?: boolean;
	dataPointCount?: number;
	rawText?: string;
	normalized?: { magnitude: number; unit: string };
	upperMagnitude?: number;
	rawBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
	};
	normalizedBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
	};
	canonicalUnit?: string;
	deniedUnits?: readonly string[];
}

export interface MeasurementDiagnostic {
	code:
		| "invalid_magnitude"
		| "invalid_data_point_count"
		| "invalid_unit"
		| "dimension_mismatch"
		| "unit_not_allowed"
		| "unit_denied"
		| "raw_bounds_exceeded"
		| "normalized_bounds_exceeded"
		| "missing_unit"
		| "non_finite_magnitude"
		| "range_not_supported"
		| "statistics_not_allowed"
		| "data_point_count_not_allowed";
	message: string;
	path?: string;
	actual?: number;
	maximum?: number;
	minimum?: number;
	unit?: string;
	rawValue?: number;
	rawUnit?: string;
	normalizedValue?: number;
	normalizedUnit?: string;
}

export interface MeasurementQuantityPolicy {
	allowRange: boolean;
	statistics: "accept" | "ignore" | "reject";
	allowDataPointCount: boolean;
}

export interface CompoundMeasurementComponent {
	key: string;
	value: MeasurementValue;
}

export function createCompoundMeasurementValue(
	components: readonly CompoundMeasurementComponent[],
	rawText?: string,
): { value?: CompositeValue; diagnostics: MeasurementDiagnostic[] } {
	const diagnostics: MeasurementDiagnostic[] = [];
	const values: Record<string, MeasurementValue> = {};
	for (const component of components) {
		if (!component.key.trim()) {
			diagnostics.push({
				code: "invalid_unit",
				message: "Compound measurement component key is required",
			});
			continue;
		}
		if (values[component.key]) {
			diagnostics.push({
				code: "invalid_unit",
				message: `Compound measurement component '${component.key}' is duplicated`,
			});
			continue;
		}
		values[component.key] = component.value;
	}
	if (components.length === 0) {
		diagnostics.push({
			code: "invalid_unit",
			message: "Compound measurement requires at least one component",
		});
	}
	return diagnostics.length > 0
		? { diagnostics }
		: { value: { kind: "composite", values, rawText }, diagnostics };
}

export function createMeasurementValueFromQuantity(
	quantity: QuantityGrammarResult,
	input: Omit<
		MeasurementValueInput,
		"magnitude" | "unit" | "statisticalType" | "operator" | "dataPointCount"
	>,
	policy: MeasurementQuantityPolicy,
): MeasurementValueResult {
	const diagnostics: MeasurementDiagnostic[] = [];
	if (quantity.upper !== undefined && !policy.allowRange) {
		diagnostics.push({
			code: "range_not_supported",
			message: "A ranged quantity is not supported by this measurement field",
		});
	}
	if (quantity.statisticalType && policy.statistics === "reject") {
		diagnostics.push({
			code: "statistics_not_allowed",
			message: "Statistical metadata is not allowed by this measurement field",
		});
	}
	if (quantity.dataPointCount !== undefined && !policy.allowDataPointCount) {
		diagnostics.push({
			code: "data_point_count_not_allowed",
			message: "Data-point counts are not allowed by this measurement field",
		});
	}
	if (diagnostics.length > 0) return { diagnostics };
	return createMeasurementValue({
		...input,
		magnitude: quantity.lower,
		unit: quantity.unit,
		upperMagnitude: policy.allowRange ? quantity.upper : undefined,
		operator: quantity.operator,
		statisticalType:
			policy.statistics === "accept" ? quantity.statisticalType : undefined,
		dataPointCount: quantity.dataPointCount,
		rawText: quantity.rawText,
	});
}

export interface MeasurementValueResult {
	value?: MeasurementValue;
	diagnostics: MeasurementDiagnostic[];
}

function toResolverDiagnostic(
	d: MeasurementResolverDiagnostic,
): MeasurementDiagnostic {
	return {
		code: d.code,
		message: d.message,
		path: d.path,
		actual: d.actual,
		maximum: d.maximum,
		minimum: d.minimum,
		unit: d.unit,
		rawValue: d.rawValue,
		rawUnit: d.rawUnit,
		normalizedValue: d.normalizedValue,
		normalizedUnit: d.normalizedUnit,
	};
}

export function createMeasurementValue(
	input: MeasurementValueInput,
	allowedUnits?: readonly string[],
): MeasurementValueResult {
	const diagnostics: MeasurementDiagnostic[] = [];
	if (!Number.isFinite(input.magnitude)) {
		diagnostics.push({
			code: "non_finite_magnitude",
			message: `Measurement magnitude must be finite, got ${input.magnitude}`,
		});
		return { diagnostics };
	}
	if (
		input.dataPointCount !== undefined &&
		(!Number.isInteger(input.dataPointCount) || input.dataPointCount < 1)
	) {
		diagnostics.push({
			code: "invalid_data_point_count",
			message: "Measurement dataPointCount must be a positive integer",
		});
	}
	if (
		input.upperMagnitude !== undefined &&
		(!Number.isFinite(input.upperMagnitude) ||
			input.upperMagnitude < input.magnitude)
	) {
		diagnostics.push({
			code: "invalid_magnitude",
			message:
				"Measurement upper bound must be finite and not below the lower bound",
		});
	}
	if (!input.unit) {
		diagnostics.push({
			code: "missing_unit",
			message: "Measurement unit is required",
		});
		return { diagnostics };
	}
	if (input.deniedUnits?.includes(input.unit)) {
		diagnostics.push({
			code: "unit_denied",
			message: `Unit '${input.unit}' is denied for dimension '${input.dimension}'`,
			unit: input.unit,
		});
		return { diagnostics };
	}
	if (allowedUnits && !allowedUnits.includes(input.unit)) {
		diagnostics.push({
			code: "invalid_unit",
			message: `Unit '${input.unit}' is not allowed for dimension '${input.dimension}'`,
			unit: input.unit,
		});
		return { diagnostics };
	}
	const constraintDiagnostics = validateMeasurementConstraints(
		{
			magnitude: input.magnitude,
			unit: input.unit,
			operator: input.operator,
			isApproximate: input.isApproximate,
			dimension: input.dimension,
			normalized: input.normalized,
			rawValue: input.magnitude,
			rawUnit: input.unit,
		},
		{
			dimension: input.dimension,
			allowedUnits,
			deniedUnits: input.deniedUnits,
			canonicalUnit: input.canonicalUnit,
			rawBounds: input.rawBounds,
			normalizedBounds: input.normalizedBounds,
		},
	);
	diagnostics.push(...constraintDiagnostics.map(toResolverDiagnostic));
	if (
		diagnostics.some(
			(d) =>
				d.code === "raw_bounds_exceeded" ||
				d.code === "normalized_bounds_exceeded",
		)
	) {
		return { diagnostics };
	}
	return {
		value: {
			kind: "measurement",
			dimension: input.dimension,
			magnitude: input.magnitude,
			unit: input.unit,
			statisticalType: input.statisticalType,
			range:
				input.upperMagnitude === undefined
					? undefined
					: {
							lower: input.magnitude,
							upper: input.upperMagnitude,
							unit: input.unit,
						},
			operator: input.operator,
			isApproximate: input.isApproximate,
			dataPointCount: input.dataPointCount,
			rawText: input.rawText,
			normalized: input.normalized,
			evidence: [],
		},
		diagnostics,
	};
}
