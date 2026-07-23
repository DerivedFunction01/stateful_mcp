import type { BaseAgent, CodeableConcept } from "./shared";
import type { TemporalBoundary } from "./time";
export type AdministrativeGender =
	| "male"
	| "female"
	| "undetermined"
	| "not_applicable";

export type SubjectLifecycleStatus =
	| "active"
	| "deceased"
	| "inactive_archived";

export interface LegalName {
	givenNames?: string[];
	primaryOrSurname: string; // The baseline index key
	prefixOrTitle?: string;
}
export interface HumanSubjectAttributes {
	race?: CodeableConcept; // Unified CDC/OMB or global standard concepts
	ethnicity?: CodeableConcept; // Unified standard concepts
}

export interface PlantSubjectAttributes {
	propagationMethod:
		| "seed_sexual"
		| "vegetative_clone"
		| "tissue_culture"
		| "grafting"
		| "unknown";
	geneticModificationStatus:
		| "wild_type"
		| "selectively_bred"
		| "gmo"
		| "crispr_edited";
	cultivationEnvironment:
		| "open_field"
		| "greenhouse"
		| "hydroponic"
		| "aeroponic"
		| "wild";
}

// Discriminator payload pattern to isolate primary species attributes
export type SubjectBiologicalAttributes =
	| ({ organismType: "human" } & HumanSubjectAttributes)
	| { organismType: "animal" } // Structural placeholders for specialized clinical domains
	| ({ organismType: "plant" } & PlantSubjectAttributes);

export interface PatientProfile {
	/**
	 * Primary Identification Keys
	 */
	id: string; // The deterministic system-wide tracking ID / hash
	mrn: string; // Medical Record Number (Internal Facility Index)

	/**
	 * core Identity Metrics
	 */
	name: LegalName;
	administrativeGender: AdministrativeGender;
	status: SubjectLifecycleStatus;

	/**
	 * Bounded Origination Matrix
	 * Reuses your TemporalBoundary to capture precise or estimated birth/germination windows
	 */
	originationDate: TemporalBoundary;
	isOriginationEstimated: boolean;

	/**
	 * Immutable Biological Attributes
	 * Uses a type-safe union to switch fields seamlessly between human, animal, and plant profiles
	 */
	biologicalProfile: BaseAgent & SubjectBiologicalAttributes;

	/**
	 * Clinical Safety Lanes
	 */
	allergies?: CodeableConcept[]; // Explicit clinical allergy concept nodes
}
