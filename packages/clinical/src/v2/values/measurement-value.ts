import type {
	MeasurementOperator,
	ValueType,
} from "../../schemas/measurement";
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
}

export interface MeasurementDiagnostic {
	code: "invalid_magnitude" | "invalid_data_point_count" | "invalid_unit";
	message: string;
}

export interface MeasurementValueResult {
	value?: MeasurementValue;
	diagnostics: MeasurementDiagnostic[];
}

export function createMeasurementValue(
	input: MeasurementValueInput,
	allowedUnits?: readonly string[],
): MeasurementValueResult {
	if (!Number.isFinite(input.magnitude)) {
		return { diagnostics: [{ code: "invalid_magnitude", message: "Measurement magnitude must be finite" }] };
	}
	if (input.dataPointCount !== undefined && (!Number.isInteger(input.dataPointCount) || input.dataPointCount < 1)) {
		return { diagnostics: [{ code: "invalid_data_point_count", message: "Measurement dataPointCount must be a positive integer" }] };
	}
	if (allowedUnits && !allowedUnits.includes(input.unit)) {
		return { diagnostics: [{ code: "invalid_unit", message: `Unit '${input.unit}' is not allowed for ${input.dimension}` }] };
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
		},
		diagnostics: [],
	};
}
