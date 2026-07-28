import type { CodeableConcept } from "./shared";
import type { ClinicalDateRange } from "./time";

// =====================================================================
// BASE ORDER OBJECT
// Shared fields for all plan-level orders.
// =====================================================================

export interface BaseOrderObject {
	id: string;
	procedure: CodeableConcept;
	rawTerm?: string;
	priority: "routine" | "urgent" | "stat";
	reason?: CodeableConcept;
	dateRange?: ClinicalDateRange;
}

// =====================================================================
// INVESTIGATION ORDER (Laboratory / Imaging)
// Outstanding tests requested — labs, radiology, POC panels.
// =====================================================================

export interface InvestigationOrderObject extends BaseOrderObject {
	investigationType: "laboratory" | "imaging";
	specimenType?: CodeableConcept; // e.g. venous blood, urine
	panelCode?: CodeableConcept; // e.g. LOINC::24320-4 Basic Metabolic Panel
	laterality?: "left" | "right" | "bilateral";
}

// =====================================================================
// REFERRAL ORDER (Specialist Routing)
// Care continuity — routing to a specialist or external service.
// =====================================================================

export type ReferralUrgency = "routine" | "urgent" | "emergent";

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

export type AnesthesiaType =
	| "general"
	| "regional"
	| "local"
	| "sedation"
	| "none";

export interface InterventionOrderObject extends BaseOrderObject {
	procedureLocation?: CodeableConcept; // e.g. operating room, bedside, clinic
	anesthesiaType?: AnesthesiaType;
	schedulingWindow?: ClinicalDateRange;
}

// =====================================================================
// SAFETY NETTING PLAN
// Patient red flags, follow-up triggers, and escalation pathway.
// =====================================================================

export type EscalationPath =
	| "emergency_department"
	| "urgent_care"
	| "call_provider"
	| "telehealth";

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
