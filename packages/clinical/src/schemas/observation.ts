import type {
  ClinicalDateRange,
  ClinicalSourceType,
  CodeableConcept,
  Status,
  Certainty,
  TimeMeasurement,
} from "./shared";

export interface ObservationEvent {
  id: string;
  soapSection: "subjective" | "objective" | "assessment";
  concept: CodeableConcept;
  rawTerm: string;
  sourceType: ClinicalSourceType;
  certainty?: Certainty;
  status?: Status;
  severity: {
    score: number;
    maxScore: number;
    normalizedScore: number;
  };
  duration: TimeMeasurement;
  trajectory:
    | "improving"
    | "worsening"
    | "stable"
    | "resolved"
    | "fluctuating"
    | "unknown";
  qualifiers?: CodeableConcept[];
  dateRange?: ClinicalDateRange;
}
