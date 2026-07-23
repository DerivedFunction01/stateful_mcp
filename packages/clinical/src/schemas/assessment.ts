import type {
	AnatomicalLocation,
	ClinicalSourceType,
	CodeableConcept,
	ProductIdentifier, // Integrated from shared primitives
} from "./shared";
import type { ScoreMeasurement } from "./measurement";
import type { ClinicalDateRange } from "./time";

export interface AlgorithmicHypothesis {
	concept?: CodeableConcept;
	scoreValue?: ScoreMeasurement;
	category?: string;
}

export interface AlgorithmicEvaluationObject {
	id: string;
	soapSection: "assessment" | "plan";
	evaluationType:
		| "diagnostic_inference"
		| "clinical_risk_score"
		| "drug_drug_interaction"
		| "drug_allergy_contraindication"
		| "dosage_threshold_violation"
		| "other_algorithmic_rule";
	algorithm: CodeableConcept;
	sourceRegistry?: string;
	mechanismDescription?: string;
	inputConcepts?: CodeableConcept[]; // Upgraded to preserve mapping boundaries
	triggeringConcepts?: CodeableConcept[]; // Upgraded to preserve mapping boundaries
	hypothesesAndOutputs: AlgorithmicHypothesis[];
	severityTier?:
		| "critical_hard_stop"
		| "warning_soft_stop"
		| "informational_notice";
	overrideStatus?: {
		isOverridden: boolean;
		justificationText?: string;
		clinicianId?: string; // Foreign key mapping token string
	};
}

export interface DeviceDiagnosticObject {
	id: string;
	soapSection: "objective";
	modality: CodeableConcept; // Structured LOINC / DICOM tracking standard
	dicomReference?: string;
	interpretation?: string; // High-entropy textual summary overview
	findings: CodeableConcept[];
	algorithmicEvaluations?: AlgorithmicEvaluationObject[];
	anatomyLocations?: AnatomicalLocation[];
	productDetails?: ProductIdentifier; // Aligned with shared component specifications
	sourceType: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}

export interface AssessmentObject {
	id: string;
	soapSection: "assessment";
	primaryDiagnosis: CodeableConcept; // Normalized disease concept (ICD-10 / SNOMED-CT)
	isHypothesis: boolean;
	differentialRank?: number;
	acuityLevel?:
		| "acute"
		| "subacute"
		| "chronic"
		| "acute_on_chronic"
		| "exacerbation";
	supportingConcepts?: CodeableConcept[];
	refutingConcepts?: CodeableConcept[];
	comorbidities?: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	dateRange?: ClinicalDateRange;
}
