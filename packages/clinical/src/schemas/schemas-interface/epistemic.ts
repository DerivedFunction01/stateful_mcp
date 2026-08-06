import type { BranchStatus } from "../../commands/command-syntax-profile";
import type { AcuityLevel } from "./assessment";
import type { Certainty, CodeableConcept } from "./shared";
import type { TemporalBoundary } from "./time";

export interface ClinicalBranch {
	id: string;
	parentId: string | null;
	name: string;
	commandAlias?: string;
	hypothesisConcept: CodeableConcept;
	status: BranchStatus;
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
