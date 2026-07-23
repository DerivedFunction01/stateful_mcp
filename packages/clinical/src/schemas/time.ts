import type { SingleMeasurement } from "./measurement";

export type DayOfWeek =
	| "monday"
	| "tuesday"
	| "wednesday"
	| "thursday"
	| "friday"
	| "saturday"
	| "sunday";

export type PartOfDay =
	| "morning"
	| "afternoon"
	| "evening"
	| "night"
	| "midnight";

export type Season =
	| "spring"
	| "summer"
	| "autumn"
	| "winter";

export type TimePrecisionLevel =
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "year"
	| "decade"
	| DayOfWeek
	| PartOfDay
	| Season;

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
