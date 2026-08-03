import type { MeasurementOperator, ValueType } from "../schemas/schemas-interface/measurement";
import {
	type MeasurementResolverDiagnostic,
	validateMeasurementConstraints,
} from "./measurement-resolver";
import type { MeasurementValue } from "./typed-value";

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
		| "non_finite_magnitude";
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
