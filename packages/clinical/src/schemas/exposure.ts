import type { DosageMeasurement } from "./measurement";
import type { MedicationFrequency } from "./medication";
import type { AnatomicalLocation, CodeableConcept, Route } from "./shared";
import type { ClinicalDateRange } from "./time";

export type ExposureType =
	| "general"
	| "chemical"
	| "pharmaceutical"
	| "biological";

export interface BaseExposureEvent {
	id: string;
	soapSection: "subjective";
	exposureType: ExposureType; // Static identifier gate for rapid parsing lookups
	substance?: CodeableConcept; // Main target compound or material description
	route?: Route;
	dateRange?: ClinicalDateRange;
	frequency?: MedicationFrequency;
}

export interface ChemicalSubstanceExposureEvent extends BaseExposureEvent {
	exposureType: "chemical";
	form?: "gas" | "liquid" | "solid" | "aerosol";
}

export interface PharmaceuticalExposureEvent extends BaseExposureEvent {
	exposureType: "pharmaceutical";
	dosage?: DosageMeasurement;
}

export interface BiologicalExposureEvent extends BaseExposureEvent {
	exposureType: "biological";
	species?: CodeableConcept; // Primary organism taxonomy standard (e.g., Plant or Insect ID)
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
	anatomyLocations?: AnatomicalLocation[]; // Targeted bite/scratch surface coordinates
	carriedPathogen?: CodeableConcept; // Secondary microscopic infections (e.g., parasites/viruses)
}

export type ExposureEvent =
	| ChemicalSubstanceExposureEvent
	| PharmaceuticalExposureEvent
	| BiologicalExposureEvent
	| BaseExposureEvent;
