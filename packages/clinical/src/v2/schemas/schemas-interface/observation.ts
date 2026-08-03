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
	duration: TimeMeasurement[];
	trajectory: ObservationTrajectory;
	qualifiers?: CodeableConcept[];
	anatomyLocations?: AnatomicalLocation[];
	dateRange?: ClinicalDateRange;
}
