import type { MedicationFrequency } from "../../schemas/medication";
import type { ClinicalDateRange, TimePrecisionLevel } from "../../schemas/time";
import type {
	MeasurementValue,
	TemporalValue,
	TemporalValuePayload,
} from "./typed-value";

export function createDurationValue(
	measurements: readonly MeasurementValue[],
	rawText?: string,
): TemporalValue {
	return {
		kind: "temporal",
		temporalType: "duration",
		value: {
			kind: "duration",
			measurements: [...measurements],
			ordered: true,
		},
		rawText,
	};
}

export function createDateValue(
	value: string,
	precision?: TimePrecisionLevel,
	): TemporalValue {
	return temporal("date", { kind: "date", value, precision });
}

export function createDateRangeValue(value: ClinicalDateRange): TemporalValue {
	return temporal("date_range", { kind: "date_range", value });
}

export function createRelativeTimeValue(
	direction: "retrospective" | "prospective" | "static_approximate",
	amount: number,
	unit: TimePrecisionLevel,
): TemporalValue {
	return temporal("relative_time", { kind: "relative_time", direction, amount, unit });
}

export function createCadenceValue(value: MedicationFrequency): TemporalValue {
	return temporal("cadence", { kind: "cadence", value });
}

function temporal(
	temporalType: TemporalValue["temporalType"],
	value: TemporalValuePayload,
): TemporalValue {
	return { kind: "temporal", temporalType, value };
}
