import type {
	ClinicalDateRange,
	DayOfWeek,
	PartOfDay,
	TemporalBoundary,
	TemporalDirection,
	TimePrecisionLevel,
} from "../schemas/schemas-interface/time";
import type { QuantityGrammarResult } from "./quantity-grammar";

export interface DateRangeSlotValues {
	start?: TemporalBoundary;
	end?: TemporalBoundary;
	repeat?: QuantityGrammarResult;
	weekdays?: DayOfWeek[];
	partsOfDay?: PartOfDay[];
	included?: DateRangeSlotValues[];
	excluded?: DateRangeSlotValues[];
	relativeEstimate?: {
		direction: TemporalDirection;
		quantity: QuantityGrammarResult;
	};
}

export interface DateRangeAssemblyDiagnostic {
	code:
		| "missing_range_endpoint"
		| "invalid_recurrence"
		| "invalid_relative_estimate"
		| "invalid_quantity_unit";
	message: string;
}

export interface DateRangeAssemblyResult {
	value?: ClinicalDateRange;
	diagnostics: DateRangeAssemblyDiagnostic[];
}

export function assembleClinicalDateRange(
	slots: DateRangeSlotValues,
): DateRangeAssemblyResult {
	const diagnostics: DateRangeAssemblyDiagnostic[] = [];
	if (slots.end && !slots.start) {
		diagnostics.push({
			code: "missing_range_endpoint",
			message: "A DateRange end boundary requires a start boundary",
		});
	}
	if (slots.start && slots.end && slots.start.assertedTimestampUtc > slots.end.assertedTimestampUtc) {
		diagnostics.push({
			code: "missing_range_endpoint",
			message: "DateRange start boundary must not be after its end boundary",
		});
	}
	if (slots.repeat) {
		if (slots.repeat.lower <= 0 || !Number.isInteger(slots.repeat.lower))
			diagnostics.push({
				code: "invalid_recurrence",
				message: "Recurrence multiplier must be a positive integer",
			});
		if (slots.repeat.upper !== undefined)
			diagnostics.push({
				code: "invalid_recurrence",
				message: "Recurrence cannot use a ranged quantity",
			});
		if (!isTimeUnit(slots.repeat.unit))
			diagnostics.push({
				code: "invalid_quantity_unit",
				message: `Unit '${slots.repeat.unit}' is not a temporal recurrence unit`,
			});
	}
	if (slots.relativeEstimate) {
		if (!isTimeUnit(slots.relativeEstimate.quantity.unit))
			diagnostics.push({
				code: "invalid_quantity_unit",
				message: `Unit '${slots.relativeEstimate.quantity.unit}' is not a temporal estimate unit`,
			});
	}
	if (diagnostics.length > 0) return { diagnostics };

	const value: ClinicalDateRange = {};
	if (slots.start || slots.end || slots.repeat || slots.weekdays || slots.partsOfDay) {
		value.time = {
			startDatetime: slots.start,
			endDatetime: slots.end,
			repeat: slots.repeat
				? {
					multiplier: slots.repeat.lower,
					level: slots.repeat.unit as TimePrecisionLevel,
					weekdays: slots.weekdays,
					partsOfDay: slots.partsOfDay,
				}
				: undefined,
		};
	}
	if (slots.included?.length) value.includedDatetimes = slots.included.map(toWindow);
	if (slots.excluded?.length) value.excludedDatetimes = slots.excluded.map(toWindow);
	if (slots.relativeEstimate) {
		value.relativeEstimate = {
			direction: slots.relativeEstimate.direction,
			firstValue: slots.relativeEstimate.quantity.lower,
			secondValue: slots.relativeEstimate.quantity.upper,
			precisionUnit: slots.relativeEstimate.quantity.unit as TimePrecisionLevel,
		};
	}
	return { value, diagnostics };
}

function toWindow(
	slots: DateRangeSlotValues,
): { time: NonNullable<ClinicalDateRange["time"]> } {
	return { time: assembleClinicalDateRange(slots).value?.time ?? {} };
}

function isTimeUnit(value: string): boolean {
	return ["second", "minute", "hour", "day", "week", "month", "year"].includes(value);
}
