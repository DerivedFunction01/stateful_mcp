import type { SingleMeasurement } from "./measurement";

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

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

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
 * Extends SingleMeasurement with a time anchor and a chronological precision
 * unit. Time measurements use primitive units and never carry concepts.
 */
export type TimeMeasurement = Omit<SingleMeasurement, "unit"> & {
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
		weekdays?: DayOfWeek[];
		partsOfDay?: PartOfDay[];
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
