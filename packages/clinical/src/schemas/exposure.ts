import type { DosageMeasurement, SingleMeasurement } from "./measurement";
import type { MedicationFrequency } from "./medication";
import type { AnatomicalLocation, CodeableConcept, Route } from "./shared";
import type { ClinicalDateRange } from "./time";

export const EXPOSURE_TYPES = [
	"general",
	"chemical",
	"pharmaceutical",
	"biological",
] as const;

export type ExposureType = (typeof EXPOSURE_TYPES)[number];

export const CHEMICAL_FORMS = [
	"gas",
	"liquid",
	"solid",
	"aerosol",
] as const;

export type ChemicalForm = (typeof CHEMICAL_FORMS)[number];

export const COMPLIANCE_STATUSES = [
	"adherent",
	"non_adherent",
	"intermittent",
	"discontinued",
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const BIOLOGICAL_MECHANISMS = [
	"bite",
	"scratch",
	"sting",
	"envenomation_contact",
	"goring",
	"tissue_ingestion",
	"dermal_trichome_contact",
	"puncture_thorn_spine",
	"pollen_spore_inhalation",
	"sap_exudate_exposure",
] as const;

export type BiologicalMechanism =
	(typeof BIOLOGICAL_MECHANISMS)[number];

export const PATHOGEN_VECTOR_STATUSES = [
	"confirmed_infected_vector",
	"suspected_unverified",
	"low_risk_clean",
] as const;

export type PathogenVectorStatus =
	(typeof PATHOGEN_VECTOR_STATUSES)[number];

export interface BaseExposureEvent {
	id: string;
	exposureType: ExposureType; // Static identifier gate for rapid parsing lookups
	substance?: CodeableConcept; // Main target compound or material description
	route?: Route;
	dateRange?: ClinicalDateRange;
	frequency?: MedicationFrequency;
	side_effects?: {
		allergic?: boolean;
		intolerant?: boolean;
		adverse_reaction?: boolean;
	};
}

export interface ChemicalSubstanceExposureEvent extends BaseExposureEvent {
	exposureType: "chemical";
	form?: ChemicalForm;
}

export interface PharmaceuticalExposureEvent extends BaseExposureEvent {
	exposureType: "pharmaceutical";
	complianceStatus: ComplianceStatus;
	dosage?: DosageMeasurement;
	count?: SingleMeasurement[];
}

export interface BiologicalExposureEvent extends BaseExposureEvent {
	exposureType: "biological";
	species?: CodeableConcept; // Primary organism taxonomy standard (e.g., Plant or Insect ID)
	breedOrCultivar?: CodeableConcept;
	mechanism?: BiologicalMechanism;
	isToxicOrVenomous?: boolean;
	pathogenVectorStatus?: PathogenVectorStatus;
	anatomyLocations?: AnatomicalLocation[]; // Targeted bite/scratch surface coordinates
	carriedPathogen?: CodeableConcept; // Secondary microscopic infections (e.g., parasites/viruses)
}

export type ExposureEvent =
	| ChemicalSubstanceExposureEvent
	| PharmaceuticalExposureEvent
	| BiologicalExposureEvent
	| BaseExposureEvent;