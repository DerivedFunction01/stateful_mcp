import type { CodeableConcept } from "../schemas/schemas-interface/shared";
import type { WorkspaceAggregate } from "./workspace-types";

export type WorkspaceSnapshotBranchStatus =
	| "active"
	| "suspended"
	| "confirmed"
	| "ruled_out"
	| "closed";

export interface WorkspaceSnapshotBranch {
	branchId: string;
	name: string;
	status: WorkspaceSnapshotBranchStatus;
	hypothesisConcept?: CodeableConcept;
	supportingConcepts: CodeableConcept[];
	refutingConcepts: CodeableConcept[];
	commandAlias?: string;
}

export interface WorkspaceSnapshot {
	workspaceId: string;
	sessionId: string;
	sourceDocumentId: string;
	activeBranchId: string | null;
	branches: WorkspaceSnapshotBranch[];
	globalFacts: WorkspaceAggregate["globalFacts"];
	closeRequested: boolean;
	completed: boolean;
	version: number;
	eventHead?: string;
}
