import type {
	AnatomicalLocation,
	Certainty,
	ClinicalSourceType,
	CodeableConcept,
	Status,
} from "./shared";
import type { ClinicalDateRange, TimeMeasurement } from "./time";

export const OBSERVATION_TRAJECTORIES = [
	"improving",
	"worsening",
	"stable",
	"resolved",
	"fluctuating",
	"unknown",
] as const;

export type ObservationTrajectory = (typeof OBSERVATION_TRAJECTORIES)[number];

export interface ClinicalObservationFinding {
	concept: CodeableConcept;
	status?: Status;
	certainty?: Certainty;
	rawTerm?: string;
	sourceType?: ClinicalSourceType;
	qualifiers?: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	dateRange?: ClinicalDateRange;
}

export interface ObservationEvent extends ClinicalObservationFinding {
	id: string;
	severity?: {
		score: number;
		maxScore: number;
		normalizedScore: number;
	};
	duration?: TimeMeasurement[];
	trajectory?: ObservationTrajectory;
}
