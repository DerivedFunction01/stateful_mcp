import type { MeasurementOperator } from "../schemas/schemas-interface/measurement";
import type { NumericBounds } from "./typed-value";

export interface MeasurementResolution {
	magnitude: number;
	unit: string;
	operator?: MeasurementOperator;
	isApproximate?: boolean;
	dimension: string;
	normalized?: { magnitude: number; unit: string };
	rawValue: number;
	rawUnit: string;
}

export interface MeasurementConstraint {
	dimension?: string;
	allowedUnits?: readonly string[];
	deniedUnits?: readonly string[];
	canonicalUnit?: string;
	rawBounds?: NumericBounds;
	normalizedBounds?: NumericBounds;
}

export interface MeasurementResolverDiagnostic {
	code:
		| "invalid_magnitude"
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

export interface MeasurementResolveResult {
	value?: MeasurementResolution;
	diagnostics: MeasurementResolverDiagnostic[];
}

export interface MeasurementResolver {
	resolve(input: {
		magnitude: number;
		rawUnit: string;
		dimension: string;
		operator?: MeasurementOperator;
		isApproximate?: boolean;
	}): MeasurementResolveResult;
}

export function createMeasurementResolver(
	allowedUnits?: readonly string[],
	deniedUnits?: readonly string[],
	canonicalUnit?: string,
	dimension?: string,
): MeasurementResolver {
	return {
		resolve(input) {
			const diagnostics: MeasurementResolverDiagnostic[] = [];
			if (!Number.isFinite(input.magnitude)) {
				diagnostics.push({
					code: "non_finite_magnitude",
					message: `Measurement magnitude must be finite, got ${input.magnitude}`,
				});
				return { diagnostics };
			}
			if (!input.rawUnit) {
				diagnostics.push({
					code: "missing_unit",
					message: "Measurement unit is required",
				});
				return { diagnostics };
			}
			if (deniedUnits?.includes(input.rawUnit)) {
				diagnostics.push({
					code: "unit_denied",
					message: `Unit '${input.rawUnit}' is denied for dimension '${dimension ?? "unknown"}'`,
					unit: input.rawUnit,
				});
				return { diagnostics };
			}
			if (allowedUnits && !allowedUnits.includes(input.rawUnit)) {
				diagnostics.push({
					code: "unit_not_allowed",
					message: `Unit '${input.rawUnit}' is not allowed for dimension '${dimension ?? "unknown"}'`,
					unit: input.rawUnit,
				});
				return { diagnostics };
			}
			const normalized = canonicalUnit
				? { magnitude: input.magnitude, unit: canonicalUnit }
				: undefined;
			const resolution: MeasurementResolution = {
				magnitude: input.magnitude,
				unit: input.rawUnit,
				operator: input.operator,
				isApproximate: input.isApproximate,
				dimension: dimension ?? "measurement",
				normalized,
				rawValue: input.magnitude,
				rawUnit: input.rawUnit,
			};
			return { value: resolution, diagnostics };
		},
	};
}

export function validateMeasurementConstraints(
	resolution: MeasurementResolution,
	constraints: MeasurementConstraint,
): MeasurementResolverDiagnostic[] {
	const diagnostics: MeasurementResolverDiagnostic[] = [];
	if (constraints.dimension && resolution.dimension !== constraints.dimension) {
		diagnostics.push({
			code: "dimension_mismatch",
			message: `Measurement dimension '${resolution.dimension}' does not match expected '${constraints.dimension}'`,
			unit: resolution.unit,
		});
	}
	if (
		constraints.allowedUnits &&
		!constraints.allowedUnits.includes(resolution.unit)
	) {
		diagnostics.push({
			code: "unit_not_allowed",
			message: `Unit '${resolution.unit}' is not in the allowed list`,
			unit: resolution.unit,
		});
	}
	if (constraints.deniedUnits?.includes(resolution.unit)) {
		diagnostics.push({
			code: "unit_denied",
			message: `Unit '${resolution.unit}' is explicitly denied`,
			unit: resolution.unit,
		});
	}
	if (constraints.rawBounds) {
		const rb = constraints.rawBounds;
		if (
			rb.min !== undefined &&
			(resolution.rawValue < rb.min ||
				(resolution.rawValue === rb.min && rb.inclusiveMin === false))
		) {
			diagnostics.push({
				code: "raw_bounds_exceeded",
				message: `Raw value ${resolution.rawValue} is below minimum ${rb.min}`,
				actual: resolution.rawValue,
				minimum: rb.min,
				unit: resolution.rawUnit,
			});
		}
		if (
			rb.max !== undefined &&
			(resolution.rawValue > rb.max ||
				(resolution.rawValue === rb.max && rb.inclusiveMax === false))
		) {
			diagnostics.push({
				code: "raw_bounds_exceeded",
				message: `Raw value ${resolution.rawValue} exceeds maximum ${rb.max}`,
				actual: resolution.rawValue,
				maximum: rb.max,
				unit: resolution.rawUnit,
			});
		}
	}
	if (constraints.normalizedBounds && resolution.normalized) {
		const nb = constraints.normalizedBounds;
		const nv = resolution.normalized.magnitude;
		if (
			nb.min !== undefined &&
			(nv < nb.min || (nv === nb.min && nb.inclusiveMin === false))
		) {
			diagnostics.push({
				code: "normalized_bounds_exceeded",
				message: `Normalized value ${nv} is below minimum ${nb.min}`,
				actual: nv,
				minimum: nb.min,
				normalizedUnit: resolution.normalized.unit,
			});
		}
		if (
			nb.max !== undefined &&
			(nv > nb.max || (nv === nb.max && nb.inclusiveMax === false))
		) {
			diagnostics.push({
				code: "normalized_bounds_exceeded",
				message: `Normalized value ${nv} exceeds maximum ${nb.max}`,
				actual: nv,
				maximum: nb.max,
				normalizedUnit: resolution.normalized.unit,
			});
		}
	}
	return diagnostics;
}
