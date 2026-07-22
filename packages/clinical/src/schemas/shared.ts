export interface CodeableConcept {
  conceptId?: string;
  display: string;
}

export type ClinicalSourceType =
  | "patient_reported"
  | "clinician_observed"
  | "sensor_import"
  | "inspection"
  | "ehr_import"
  | "api_telemetry"
  | "telemetry_api"
  | "pacs_integration";

export type Status = "present" | "absent" | "denied" | "resolved" | "newly_diganosed" | "not_applicable";

export type Certainty = "confirmed" | "suspected" | "refuted" | "differential";

export interface SingleMeasurement {
  magnitude: number;
  unit?: CodeableConcept;
  num_data_points?: number;
  operator?: "eq" | "gt" | "gte" | "lt" | "lte";
  is_approximate?: boolean;
}

export interface TimeMeasurement extends Omit<SingleMeasurement, "unit"> {
  /**
   * Strictly limits measurement units to unchangeable chronological intervals.
   * Reuses your shared TimePrecisionLevel type ("second" | "minute" | "hour", etc.)
   */
  unit?: TimePrecisionLevel;
}

export type TimePrecisionLevel =
  | "second"
  | "minute"
  | "hour"
  | "morning_afternoon_evening"
  | "day"
  | "day_of_week"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "decade";

export interface TemporalBoundary {
  assertedTimestampUtc: string;
  precisionLevel: TimePrecisionLevel;
}

export interface TimeInterval {
  startDatetime?: TemporalBoundary;
  endDatetime?: TemporalBoundary;
  repeat?: {
    multiplier: number;
    level: TimePrecisionLevel;
  };
}

export interface ClinicalDateRange {
  time?: TimeInterval;
  includedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
  excludedDatetimes?: Array<{ time: TimeInterval; description?: string }>;
  relativeEstimate?: {
    direction: "retrospective" | "prospective" | "static_approximate";
    firstValue: number;
    secondValue?: number;
    precisionUnit: TimePrecisionLevel;
    isDescriptive?: boolean;
  };
}

export interface BaseAgent {
  id?: string;
  organismType: "human" | "animal" | "plant";
  relationshipRole?: CodeableConcept;
  identifierKey?: string;
}

export interface HumanAgent extends BaseAgent {
  organismType: "human";
  socialRole:
    | "blood_relative"
    | "non_blood_relative"
    | "caregiver"
    | "friend"
    | "stranger"
    | "healthcare_provider";
}

export interface NonHumanAgent extends BaseAgent {
  organismType: "animal" | "plant";
  domesticationStatus:
    | "domesticated_managed"
    | "wild_unmanaged"
    | "feral"
    | "cultivated_agricultural";
  functionalUseSetting?:
    | "household_pet"
    | "working_service_animal"
    | "livestock_production"
    | "laboratory_research";
}

export type AssociatedAgent = HumanAgent | NonHumanAgent;

export interface ProductIdentifier {
  manufacturer?: CodeableConcept;
  modelOrProductName?: string;
  modelOrProductNumber?: string;
  buildYear?: number;
  registryTrackingNumber?: string;
}

export interface AnatomicalLocation {
  anatomy: CodeableConcept;
  laterality?:
    | "left"
    | "right"
    | "bilateral"
    | "midline"
    | "dorsal"
    | "ventral"
    | "axial"
    | "radial";
  depthIndex?: number;
}
