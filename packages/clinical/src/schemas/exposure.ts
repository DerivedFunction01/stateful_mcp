import type {
  AnatomicalLocation,
  ClinicalDateRange,
  CodeableConcept,
  SingleMeasurement,
} from "./shared";

export interface BaseExposureEvent {
  id: string;
  soapSection: "subjective";
  substance?: CodeableConcept;
  deliveryMethod?: CodeableConcept;
  dateRange?: ClinicalDateRange;
}

export interface ChemicalSubstanceExposureEvent extends BaseExposureEvent {
  form?: "gas" | "liquid" | "solid" | "aerosol";
  route?: string;
}

export interface PharmaceuticalExposureEvent extends BaseExposureEvent {
  dosage?: SingleMeasurement;
  frequency?: CodeableConcept;
  route?: CodeableConcept;
}

export interface BiologicalExposureEvent extends BaseExposureEvent {
  species?: CodeableConcept;
  breedOrCultivar?: CodeableConcept;
  mechanism?:
    | "bite"
    | "scratch"
    | "sting"
    | "envenomation_contact"
    | "goring"
    | "tissue_ingestion"
    | "dermal_trichome_contact"
    | "puncture_thorn_spine"
    | "pollen_spore_inhalation"
    | "sap_exudate_exposure";
  isToxicOrVenomous?: boolean;
  pathogenVectorStatus?:
    | "confirmed_infected_vector"
    | "suspected_unverified"
    | "low_risk_clean";
  anatomyLocations?: AnatomicalLocation[];
  vectorAgent?: CodeableConcept;
}

export type ExposureEvent =
  | ChemicalSubstanceExposureEvent
  | PharmaceuticalExposureEvent
  | BiologicalExposureEvent;