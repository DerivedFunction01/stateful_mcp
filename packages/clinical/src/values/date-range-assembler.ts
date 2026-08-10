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
	const includedWindows: Array<{ time: NonNullable<ClinicalDateRange["time"]> }> = [];
	if (slots.included?.length) {
		for (const inc of slots.included) {
			const res = assembleClinicalDateRange(inc);
			if (res.diagnostics.length > 0 || !res.value?.time) {
				diagnostics.push(...(res.diagnostics.length > 0 ? res.diagnostics : [{
					code: "missing_range_endpoint" as const,
					message: "Included window DateRange assembly failed",
				}]));
			} else {
				includedWindows.push({ time: res.value.time });
			}
		}
	}
	const excludedWindows: Array<{ time: NonNullable<ClinicalDateRange["time"]> }> = [];
	if (slots.excluded?.length) {
		for (const exc of slots.excluded) {
			const res = assembleClinicalDateRange(exc);
			if (res.diagnostics.length > 0 || !res.value?.time) {
				diagnostics.push(...(res.diagnostics.length > 0 ? res.diagnostics : [{
					code: "missing_range_endpoint" as const,
					message: "Excluded window DateRange assembly failed",
				}]));
			} else {
				excludedWindows.push({ time: res.value.time });
			}
		}
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
	if (includedWindows.length) value.includedDatetimes = includedWindows;
	if (excludedWindows.length) value.excludedDatetimes = excludedWindows;
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
