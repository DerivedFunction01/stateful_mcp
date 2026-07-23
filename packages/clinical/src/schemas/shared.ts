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

export type Status =
	| "present"
	| "absent"
	| "denied"
	| "resolved"
	| "newly_diganosed"
	| "not_applicable";

export type Certainty = "confirmed" | "suspected" | "refuted" | "differential";

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

export type Route =
	| "oral"
	| "intravenous"
	| "intramuscular"
	| "subcutaneous"
	| "topical"
	| "inhalation"
	| "sublingual"
	| "rectal"
	| "intranasal"
	| "transdermal"
	| "ophthalmic"
	| "otic"
	| "intrathecal";
