import type { CodeableConcept } from "../schemas/shared";
import type { Cell } from "./cell";

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

export interface WorkspaceCellSummary {
	cellId: string;
	workspaceId: string;
	sessionId: string;
	rawInput: string;
	status: Cell["status"];
	updatedAt: string;
	routing: Cell["routing"];
	parsedOutput: Cell["parsedOutput"];
	workspaceCommands?: Cell["workspaceCommands"];
	workspaceCommandWarnings?: Cell["workspaceCommandWarnings"];
	errorMessage?: string;
	metadata?: Cell["metadata"];
}

export interface WorkspaceLifecycleSummary {
	closeRequested: boolean;
}

export interface WorkspaceSnapshot {
	workspaceId: string;
	sourceSoapNoteId: string;
	activeBranchId: string | null;
	branches: BranchSummary[];
	globalFacts: GlobalFactItem[];
	globalFactCount: number;
	cells: WorkspaceCellSummary[];
	lifecycle: WorkspaceLifecycleSummary;
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
