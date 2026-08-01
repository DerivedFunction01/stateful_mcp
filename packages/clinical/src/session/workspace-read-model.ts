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
	supporting: string[];
	refuting: string[];
	supportingCount: number;
	refutingCount: number;
	commandAlias?: string;
}

export interface GlobalFactItem {
	targetSchema: string;
	rawText?: string;
	extractedData?: Record<string, unknown>;
}

export interface WorkspaceSnapshot {
	workspaceId: string;
	sourceSoapNoteId: string;
	activeBranchId: string | null;
	branches: BranchSummary[];
	globalFacts: GlobalFactItem[];
	globalFactCount: number;
}

export interface WorkspaceReadModel {
	getWorkspace(
		sessionId: string,
		workspaceId: string,
	): Promise<WorkspaceSnapshot | null>;
	listWorkspaces(
		sessionId: string,
		soapNoteId: string,
	): Promise<WorkspaceSnapshot[]>;
}
