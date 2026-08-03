import type { CountMeasurement, DosageMeasurement } from "./measurement";
import type { CodeableConcept, Route } from "./shared";
import type { ClinicalDateRange, TimePrecisionLevel } from "./time";

export const CADENCE_BASE_TYPES = [
	"interval",
	"event_anchored",
	"continuous",
	"one_time",
] as const;

export type CadenceBaseType = (typeof CADENCE_BASE_TYPES)[number];

export const PHYSIOLOGICAL_EVENT_ANCHORS = [
	"waking",
	"before_meal",
	"with_meal",
	"after_meal",
	"before_sleep",
] as const;

export type PhysiologicalEventAnchor =
	(typeof PHYSIOLOGICAL_EVENT_ANCHORS)[number];

export const FREQUENCY_SHORTHANDS = ["QD", "BID", "TID", "QID"] as const;

export type FrequencyShorthand = (typeof FREQUENCY_SHORTHANDS)[number];

export interface MedicationFrequency {
	cadenceType: CadenceBaseType;

	/**
	 * Bounded time intervals (e.g., every 8 hours, every 2 weeks).
	 * Populated exclusively when cadenceType === "interval".
	 * Reuses your shared TimePrecisionLevel definition.
	 */
	interval?: {
		multiplier: number;
		unit: TimePrecisionLevel;
	};

	/**
	 * Represents rates (e.g., 3 times per week, 150 times per year).
	 * Populated when frequency is dictated as repetitions over a duration period.
	 */
	rate?: {
		times: number;
		period: TimePrecisionLevel;
	};

	/**
	 * Tied to biological/physiological circadian rhythms rather than wall-clock time.
	 * Populated exclusively when cadenceType === "event_anchored".
	 */
	eventAnchor?: PhysiologicalEventAnchor;

	/**
	 * As-needed authorization flag (pro re nata).
	 */
	isPrn: boolean;

	/**
	 * The clinical trigger condition justifying PRN administration.
	 * Reuses shared CodeableConcept (e.g., "Severe Pain", "Nausea").
	 */
	prnReason?: CodeableConcept;
}

export interface MedicationOrderObject {
	id: string;
	medication: CodeableConcept;
	rawTerm?: string;
	dosage?: DosageMeasurement;
	count?: CountMeasurement;
	frequency?: MedicationFrequency; // Formally transitioned to a parameterized struct
	route?: Route;
	quantityToDispense?: number;
	authorizedRefills: number;
	genericSubstitutionPermitted: boolean;
	targetIndication?: CodeableConcept;
	dateRange?: ClinicalDateRange;
}