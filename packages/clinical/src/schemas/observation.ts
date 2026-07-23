import type {
	Certainty,
	ClinicalSourceType,
	CodeableConcept,
	Status,
} from "./shared";
import type { TimeMeasurement } from "./time";
import type { ClinicalDateRange } from "./time";

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
