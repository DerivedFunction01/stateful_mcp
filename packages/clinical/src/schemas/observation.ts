import type {
	AnatomicalLocation,
	Certainty,
	ClinicalSourceType,
	CodeableConcept,
	Status,
} from "./shared";
import type { ClinicalDateRange, TimeMeasurement } from "./time";

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
	anatomy?: AnatomicalLocation;
	dateRange?: ClinicalDateRange;
}

export interface ExclusionEvent {
	id: string;
	soapSection: "subjective" | "objective"; // Tightly scoped to where exclusions happen
	exclusionType: "review_of_systems" | "symptom_group" | "allergy_class" | "medical_history";
	
	// The structural anchor (e.g., "Constitutional", "Respiratory", "Beta-Lactam Antibiotics")
	categoryContext: CodeableConcept; 
	
	// The structural override you wanted: an array of explicitly denied concepts
	deniedConcepts: CodeableConcept[]; 
	
	// Captures cases where the provider checked "All negative / Normal-by-default"
	allOtherSystemsNegative: boolean; 
	sourceType: ClinicalSourceType;
	dateRange?: ClinicalDateRange; // When the negation was true (e.g., "for the past 3 days")
	exceptions?: CodeableConcept[] | string;   // Captures "Patient denies cough except when laughing"
}