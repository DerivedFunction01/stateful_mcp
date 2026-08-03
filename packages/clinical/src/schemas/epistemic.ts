import type { AcuityLevel } from "./assessment";
import type { Certainty, CodeableConcept } from "./shared";
import type { TemporalBoundary } from "./time";

export const BRANCH_LIFECYCLE_STATES = [
	"active",
	"suspended",
	"confirmed",
	"ruled_out",
	"abandoned",
] as const;

export type BranchLifecycleState = (typeof BRANCH_LIFECYCLE_STATES)[number];

export interface ClinicalBranch {
	id: string;
	parentId: string | null;
	name: string;
	commandAlias?: string;
	hypothesisConcept: CodeableConcept;
	status: BranchLifecycleState;
	supportingConcepts: CodeableConcept[];
	refutingConcepts: CodeableConcept[];
	rank?: number;
	confidence?: Certainty;
	acuityLevel?: AcuityLevel;
	createdAt: TemporalBoundary;
	closedAt?: TemporalBoundary;
}

export interface EpistemicWorkspace {
	id: string;
	sourceSoapNoteId: string;
	linkedSourceEventId: string;
	branches: ClinicalBranch[];
	activeBranchId: string;
	globalFacts: Array<Record<string, unknown>>;
	closeRequested?: boolean;
}
