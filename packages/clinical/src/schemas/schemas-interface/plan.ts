import type { CodeableConcept, Laterality } from "./shared";
import type { ClinicalDateRange } from "./time";

export const PRIORITIES = ["routine", "urgent", "stat"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const INVESTIGATION_TYPES = ["laboratory", "imaging"] as const;

export type InvestigationType = (typeof INVESTIGATION_TYPES)[number];

export const REFERRAL_URGENCIES = ["routine", "urgent", "emergent"] as const;

export type ReferralUrgency = (typeof REFERRAL_URGENCIES)[number];

export const ANESTHESIA_TYPES = [
	"general",
	"regional",
	"local",
	"sedation",
	"none",
] as const;

export type AnesthesiaType = (typeof ANESTHESIA_TYPES)[number];

export const ESCALATION_PATHS = [
	"emergency_department",
	"urgent_care",
	"call_provider",
	"telehealth",
] as const;

export type EscalationPath = (typeof ESCALATION_PATHS)[number];

// =====================================================================
// BASE ORDER OBJECT
// Shared fields for all plan-level orders.
// =====================================================================

export interface BaseOrderObject {
	id: string;
	procedure: CodeableConcept;
	rawTerm?: string;
	priority: Priority;
	reason?: CodeableConcept;
	dateRange?: ClinicalDateRange;
}

// =====================================================================
// INVESTIGATION ORDER (Laboratory / Imaging)
// Outstanding tests requested — labs, radiology, POC panels.
// =====================================================================

export interface InvestigationOrderObject extends BaseOrderObject {
	investigationType: InvestigationType;
	specimenType?: CodeableConcept; // e.g. venous blood, urine
	panelCode?: CodeableConcept; // e.g. LOINC::24320-4 Basic Metabolic Panel
	laterality?: Laterality;
}

// =====================================================================
// REFERRAL ORDER (Specialist Routing)
// Care continuity — routing to a specialist or external service.
// =====================================================================

export interface ReferralOrderObject extends BaseOrderObject {
	specialistDiscipline: CodeableConcept; // e.g. Cardiology, Neurology
	referralUrgency: ReferralUrgency;
	clinicalQuestion?: string; // Specific question for the consultant
	routingNotes?: string; // Facility or provider routing instructions
}

// =====================================================================
// INTERVENTION ORDER (Procedures / Surgeries)
// Scheduled or requested clinical procedures not captured as lab/imaging.
// =====================================================================

export interface InterventionOrderObject extends BaseOrderObject {
	procedureLocation?: CodeableConcept; // e.g. operating room, bedside, clinic
	anesthesiaType?: AnesthesiaType;
	schedulingWindow?: ClinicalDateRange;
}

// =====================================================================
// SAFETY NETTING PLAN
// Patient red flags, follow-up triggers, and escalation pathway.
// =====================================================================

export interface SafetyNettingPlan {
	/**
	 * Explicit alarm symptoms the patient should watch for.
	 * Coded concepts (e.g. SNOMED::230145002 Difficulty breathing).
	 */
	redFlagSymptoms: CodeableConcept[];

	/**
	 * Narrative return precautions — patient-facing instructions.
	 */
	returnPrecautions: string;

	/**
	 * The expected follow-up window for this encounter.
	 */
	followUpWindow: ClinicalDateRange;

	/**
	 * Specific conditions or symptom changes that should accelerate the follow-up.
	 */
	followUpTriggers?: CodeableConcept[];

	/**
	 * The recommended escalation path if red flags occur.
	 */
	escalationPath?: EscalationPath;
}

export interface MilitaryPlanExtension {
	// The formal administrative status of the service member
	disposition:
		| "return_to_duty"
		| "sick_in_quarters" // Ordered to stay in their barracks/bunk (typically 24-72 hrs)
		| "light_duty" // Can work, but with physical constraints
		| "limited_duty" // Long-term medically restricted profile
		| "medevac_requested" // Transfer to a higher echelon of care
		| "admitted_to_mtf"; // Hospitalized at a Military Treatment Facility

	// The specific physical limitations profile
	dutyLimitations?: {
		running?: boolean;
		cycling?: boolean;
		swimming?: boolean;
		max_lifting_lbs?: number;
		body_armor_or_helmet?: boolean;
		weapon_handling?: boolean;
		profile_duration_days?: number;
	};
}
