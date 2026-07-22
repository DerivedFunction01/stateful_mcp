import type {
	ClinicalDateRange,
	CodeableConcept,
	Route,
	SingleMeasurement,
	TimePrecisionLevel,
} from "./shared";
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
	dosage?: SingleMeasurement;
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

export class MedicationHelper {
	static parseQuantityUnit(groups: { quantity: string; unit: string }): {
		value: number;
		unit: string;
	} {
		const val = Number.parseFloat(groups.quantity);
		let unitMapped = groups.unit.toLowerCase();
		if (
			unitMapped === "h" ||
			unitMapped === "hr" ||
			unitMapped.startsWith("hour")
		) {
			unitMapped = "hours";
		} else if (unitMapped === "d" || unitMapped.startsWith("day")) {
			unitMapped = "days";
		}
		return { value: val, unit: unitMapped };
	}
}
