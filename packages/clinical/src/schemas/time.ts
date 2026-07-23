import type { SingleMeasurement } from "./measurement";

export type TimePrecisionLevel =
	| "second"
	| "minute"
	| "hour"
	| "morning_afternoon_evening"
	| "day"
	| "day_of_week"
	| "week"
	| "month"
	| "quarter"
	| "year"
	| "decade";

/**
 * Extends SingleMeasurement but overrides `unit` with a chronological precision level
 * instead of a CodeableConcept — keeping it in the hierarchy while remaining incompatible
 * with physical-dimension anchored types.
 */
export interface TimeMeasurement extends Omit<SingleMeasurement, "unit"> {
	unit?: TimePrecisionLevel;
}

export interface TemporalBoundary {
	assertedTimestampUtc: string;
	precisionLevel: TimePrecisionLevel;
}

export interface TimeInterval {
	startDatetime?: TemporalBoundary;
	endDatetime?: TemporalBoundary;
	repeat?: {
		multiplier: number;
		level: TimePrecisionLevel;
	};
}

export interface ClinicalDateRange {
	time?: TimeInterval;
	includedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
	excludedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
	relativeEstimate?: {
		direction: "retrospective" | "prospective" | "static_approximate";
		firstValue: number;
		secondValue?: number;
		precisionUnit: TimePrecisionLevel;
		isDescriptive?: boolean;
	};
}
