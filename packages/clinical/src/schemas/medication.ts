import type { DosageMeasurement } from "./measurement";
import type { CodeableConcept, Route } from "./shared";
import type { ClinicalDateRange, TimePrecisionLevel } from "./time";

export type CadenceBaseType =
	| "interval"
	| "event_anchored"
	| "continuous"
	| "one_time";

export type PhysiologicalEventAnchor =
	| "waking"
	| "before_meal"
	| "with_meal"
	| "after_meal"
	| "before_sleep";

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
	soapSection: "plan";
	medication: CodeableConcept;
	rawTerm?: string;
	dosage?: DosageMeasurement;
	frequency?: MedicationFrequency; // Formally transitioned to a parameterized struct
	route?: Route;
	quantityToDispense?: number;
	authorizedRefills: number;
	genericSubstitutionPermitted: boolean;
	targetIndication?: CodeableConcept;
	dateRange?: ClinicalDateRange;
}

export interface ProcedureOrderObject {
	id: string;
	soapSection: "plan";
	orderCategory: "laboratory" | "imaging" | "referral" | "intervention";
	procedure: CodeableConcept;
	rawTerm?: string;
	priority: "routine" | "urgent" | "stat";
	reason?: CodeableConcept;
}

export interface FollowUpPlanObject {
	id: string;
	soapSection: "plan";
	followUpWindow: ClinicalDateRange;
	instructions?: string;
}
