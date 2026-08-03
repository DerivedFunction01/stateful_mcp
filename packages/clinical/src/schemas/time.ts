import type { SingleMeasurement } from "./measurement";
import type { CodeableConcept } from "./shared";

export const DAY_OF_WEEKS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;

export type DayOfWeek = (typeof DAY_OF_WEEKS)[number];

export const PARTS_OF_DAY = [
	"morning",
	"afternoon",
	"evening",
	"night",
	"midnight",
] as const;

export type PartOfDay = (typeof PARTS_OF_DAY)[number];

export const SEASONS = [
	"spring",
	"summer",
	"autumn",
	"winter",
] as const;

export type Season = (typeof SEASONS)[number];

export const TIME_UNITS = [
	"second",
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"year",
] as const;

export type TimeUnit = (typeof TIME_UNITS)[number];

export const TIME_PRECISION_LEVELS = [
	...TIME_UNITS,
	"quarter",
	"decade",
	...DAY_OF_WEEKS,
	...PARTS_OF_DAY,
	...SEASONS,
] as const;

export const TEMPORAL_DIRECTION = [
	"retrospective",
	"prospective",
	"static_approximate",
] as const;
export type TemporalDirection = (typeof TEMPORAL_DIRECTION)[number];

export type TimePrecisionLevel = (typeof TIME_PRECISION_LEVELS)[number];

/**
 * Extends SingleMeasurement but overrides `unit` with a chronological precision level
 * instead of a CodeableConcept — keeping it in the hierarchy while remaining incompatible
 * with physical-dimension anchored types.
 */
export type TimeMeasurement = Omit<SingleMeasurement, 'unit'> & {
    unitAnchor: "time";
    unit?: TimePrecisionLevel;
};

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
		direction: TemporalDirection;
		firstValue: number;
		secondValue?: number;
		precisionUnit: TimePrecisionLevel;
		isDescriptive?: boolean;
	};
}