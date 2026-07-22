import type {
  AnatomicalLocation,
  ClinicalDateRange,
  ClinicalSourceType,
  CodeableConcept,
  SingleMeasurement,
} from "./shared";

export interface AlgorithmicHypothesis {
  concept?: CodeableConcept;
  probability?: number;
  scoreValue?: SingleMeasurement;
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
  inputConcepts?: string[];
  triggeringConceptIds?: string[];
  hypothesesAndOutputs: AlgorithmicHypothesis[];
  severityTier?:
    | "critical_hard_stop"
    | "warning_soft_stop"
    | "informational_notice";
  overrideStatus?: {
    isOverridden: boolean;
    justificationText?: string;
    clinicianId?: string;
  };
}

export interface DeviceDiagnosticObject {
  id: string;
  soapSection: "objective";
  modality: CodeableConcept;
  dicomReference?: string;
  interpretation?: string;
  findings: CodeableConcept[];
  algorithmicEvaluations?: AlgorithmicEvaluationObject[];
  anatomyLocations?: AnatomicalLocation[];
  productDetails?: CodeableConcept;
  sourceType: ClinicalSourceType;
  dateRange?: ClinicalDateRange;
}

export interface AssessmentObject {
  id: string;
  soapSection: "assessment";
  primaryDiagnosis: CodeableConcept;
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
