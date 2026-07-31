import type { DosageMeasurement, SingleMeasurement } from "./measurement";
import type { MedicationFrequency } from "./medication";
import type { ClinicalSourceType, CodeableConcept } from "./shared";
import type { ClinicalDateRange } from "./time";

// =====================================================================
// ALLERGY ENTRY
// =====================================================================

export type AllergyVerificationStatus =
	| "confirmed"
	| "suspected"
	| "refuted"
	| "entered_in_error";

export type AllergySeverity =
	| "mild"
	| "moderate"
	| "severe"
	| "life_threatening";

export interface AllergyEntry {
	id: string;
	substance: CodeableConcept; // The allergen (drug, food, environmental, etc.)
	reactionType?: CodeableConcept[]; // e.g. anaphylaxis, urticaria, angioedema
	allergySeverity?: AllergySeverity;
	verificationStatus: AllergyVerificationStatus;
	onsetDateRange?: ClinicalDateRange;
}

// =====================================================================
// SOCIAL HISTORY ENTRY
// =====================================================================

export type SocialHistoryStatus = "current" | "former" | "never";

export interface SocialHistoryEntry {
	id: string;
	category: CodeableConcept; // e.g. smoking, alcohol, occupation, exercise
	status: SocialHistoryStatus;
	count?: SingleMeasurement; // e.g. { magnitude: 1, unit: { display: "pack" } }
	frequency?: MedicationFrequency; // e.g. { cadenceType: "interval", rate: { times: 1, period: "d" } }
	dateRange?: ClinicalDateRange;
	notes?: string;
}

// =====================================================================
// REPORTED MEDICATION ENTRY (PMH — currently taking)
// Distinct from MedicationOrderObject (a new clinical order in the plan).
// Represents medications the patient reports they are already taking.
// =====================================================================

export interface ReportedMedicationEntry {
	id: string;
	medication: CodeableConcept;
	dosage?: DosageMeasurement;
	count?: SingleMeasurement;
	frequency?: MedicationFrequency;
	complianceStatus:
		| "adherent"
		| "non_adherent"
		| "intermittent"
		| "discontinued";
	sourceType: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}

// =====================================================================
// PATIENT HISTORIES (Subjective — PMH slot)
// =====================================================================

export interface PatientHistories {
	/**
	 * Prior diagnoses and chronic conditions reported by the patient.
	 * Normalized disease concepts (ICD-10 / SNOMED-CT).
	 */
	pastMedicalHistory: CodeableConcept[];

	/**
	 * Medications the patient is currently taking at the time of this encounter.
	 * These are patient-reported — not clinical orders.
	 */
	currentMedications: ReportedMedicationEntry[];

	/**
	 * Confirmed, suspected, or refuted allergies.
	 * Richer than a bare CodeableConcept — includes severity and verification status.
	 */
	allergies: AllergyEntry[];

	/**
	 * Relevant family history diagnoses.
	 */
	familyHistory?: CodeableConcept[];

	/**
	 * Lifestyle and social context entries (smoking, alcohol, occupation, etc.).
	 */
	socialHistory?: SocialHistoryEntry[];

	/**
	 * Immunization concepts on record.
	 */
	immunizations?: CodeableConcept[];

	/**
	 * Prior surgical procedures reported by the patient.
	 */
	surgicalHistory?: CodeableConcept[];
}
