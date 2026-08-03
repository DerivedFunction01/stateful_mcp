export interface CodeableConcept {
	conceptId?: string;
	display: string;
}

export const CLINICAL_SOURCE_TYPES = [
	"patient_reported",
	"clinician_observed",
	"sensor_import",
	"inspection",
	"ehr_import",
	"api_telemetry",
	"telemetry_api",
	"pacs_integration",
] as const;

export type ClinicalSourceType = (typeof CLINICAL_SOURCE_TYPES)[number];

export const STATUSES = [
	"present",
	"absent",
	"denied",
	"resolved",
	"newly_diagnosed",
	"not_applicable",
] as const;

export type Status = (typeof STATUSES)[number];

export const CERTAINTIES = [
	"confirmed",
	"suspected",
	"refuted",
	"differential",
] as const;

export type Certainty = (typeof CERTAINTIES)[number];

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

export const LATERALITIES = [
	"left",
	"right",
	"bilateral",
	"midline",
	"dorsal",
	"ventral",
	"axial",
	"radial",
] as const;

export type Laterality = (typeof LATERALITIES)[number];

export interface AnatomicalLocation {
	anatomy: CodeableConcept;
	laterality?: Laterality;
	depthIndex?: number;
}

export const ROUTES = [
	"oral",
	"intravenous",
	"intramuscular",
	"subcutaneous",
	"topical",
	"inhalation",
	"sublingual",
	"rectal",
	"intranasal",
	"transdermal",
	"ophthalmic",
	"otic",
	"intrathecal",
] as const;

export type Route = (typeof ROUTES)[number];

export const STRINGIFIED_BOOLEANS = ["true", "false"] as const;

export type StringifiedBoolean = (typeof STRINGIFIED_BOOLEANS)[number];

export const ORGAN_SYSTEMS = [
	"heent",
	"cardiovascular",
	"respiratory",
	"gastrointestinal_abdominal",
	"musculoskeletal",
	"neurological",
	"dermatological",
	"psychiatric",
	"genitourinary",
] as const;

export type OrganSystem = (typeof ORGAN_SYSTEMS)[number];

export const SOAP_SECTIONS = [
	"subjective",
	"objective",
	"assessment",
	"plan",
] as const;

export type SoapSection = (typeof SOAP_SECTIONS)[number];
