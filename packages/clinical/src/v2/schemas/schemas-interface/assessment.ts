import type { ScoreMeasurement } from "./measurement";
import type { AnatomicalLocation, Certainty, CodeableConcept } from "./shared";
import type { ClinicalDateRange } from "./time";

export const ALGORITHMIC_EVALUATION_TYPES = [
	"diagnostic_inference",
	"clinical_risk_score",
	"drug_drug_interaction",
	"drug_allergy_contraindication",
	"dosage_threshold_violation",
	"other_algorithmic_rule",
] as const;

export type AlgorithmicEvaluationType =
	(typeof ALGORITHMIC_EVALUATION_TYPES)[number];

export const SEVERITY_TIERS = [
	"critical_hard_stop",
	"warning_soft_stop",
	"informational_notice",
] as const;

export type SeverityTier = (typeof SEVERITY_TIERS)[number];

// =====================================================================
// ALGORITHMIC EVALUATION
// =====================================================================

export interface AlgorithmicHypothesis {
	concept?: CodeableConcept;
	scoreValue?: ScoreMeasurement[];
	category?: string;
}

export interface AlgorithmicEvaluationObject {
	id: string;
	evaluationType: AlgorithmicEvaluationType;
	algorithm: CodeableConcept;
	sourceRegistry?: string;
	mechanismDescription?: string;
	inputConcepts?: CodeableConcept[]; // Upgraded to preserve mapping boundaries
	triggeringConcepts?: CodeableConcept[]; // Upgraded to preserve mapping boundaries
	hypothesesAndOutputs: AlgorithmicHypothesis[];
	severityTier?: SeverityTier;
	overrideStatus?: {
		isOverridden: boolean;
		justificationText?: string;
		clinicianId?: string; // Foreign key mapping token string
	};
}

// =====================================================================
// PRIMARY DIAGNOSIS
// The single working diagnosis for this encounter.
// =====================================================================

export const ACUITY_LEVELS = [
	"acute",
	"subacute",
	"chronic",
	"acute_on_chronic",
	"exacerbation",
] as const;

export type AcuityLevel = (typeof ACUITY_LEVELS)[number];

export interface PrimaryDiagnosisEntry {
	id: string;
	diagnosis: CodeableConcept; // Normalized disease concept (ICD-10 / SNOMED-CT)
	acuityLevel?: AcuityLevel;
	supportingConcepts?: CodeableConcept[];
	comorbidities?: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	/**
	 * Medications causally or contextually linked to this diagnosis.
	 * These are concept pointers (references) — not clinical orders.
	 * Full medication detail lives in subjective.patientHistories.currentMedications.
	 * Examples: "ACE inhibitor-induced cough", "metformin-induced lactic acidosis".
	 */
	relatedMedications?: CodeableConcept[];
	dateRange?: ClinicalDateRange;
}

// =====================================================================
// DIFFERENTIAL DIAGNOSIS ARRAY
// Ranked list of hypotheses considered during the assessment.
// =====================================================================

export const DIFFERENTIAL_DIAGNOSIS_STATUSES = [
	"active",
	"ruled_out",
	"abandoned",
] as const;

export type DifferentialDiagnosisStatus =
	(typeof DIFFERENTIAL_DIAGNOSIS_STATUSES)[number];

export interface DifferentialDiagnosisEntry {
	id: string;
	/**
	 * Mandatory rank — the differential array must be sorted by this value.
	 * Lower rank = higher clinical suspicion (rank 1 = most likely).
	 */
	rank: number;
	diagnosis: CodeableConcept;
	confidence: Certainty;
	supportingConcepts?: CodeableConcept[];
	refutingConcepts?: CodeableConcept[];
	/**
	 * Medications causally or contextually linked to this differential candidate.
	 * Same semantics as PrimaryDiagnosisEntry.relatedMedications.
	 */
	relatedMedications?: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	dateRange?: ClinicalDateRange;
	status?: DifferentialDiagnosisStatus;
}
