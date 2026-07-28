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