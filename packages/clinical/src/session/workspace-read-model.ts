import type { CodeableConcept } from "../schemas/shared";

export type BranchStatus =
	| "active"
	| "suspended"
	| "confirmed"
	| "rule_out"
	| "closed";

export interface BranchSummary {
	branchId: string;
	name: string;
	status: BranchStatus;
	hypothesisConcept?: CodeableConcept;
	supportingCount: number;
	refutingCount: number;
}

export interface WorkspaceSnapshot {
	workspaceId: string;
	sourceSoapNoteId: string;
	activeBranchId: string | null;
	branches: BranchSummary[];
	globalFactCount: number;
}

export interface WorkspaceReadModel {
	getWorkspace(
		sessionId: string,
		workspaceId: string,
	): Promise<WorkspaceSnapshot | null>;
	listWorkspaces(sessionId: string): Promise<WorkspaceSnapshot[]>;
}
