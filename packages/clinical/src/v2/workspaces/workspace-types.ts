/**
 * V2 workspace typed contracts (type-only).
 *
 * These are the typed aggregates/operations the workspace service will compile
 * and the transaction coordinator will commit. The legacy
 * `WorkspaceStore(parser)` and `ParsedItem`-based fact extraction are not used.
 */

import type { CodeableConcept } from "../../schemas/shared";

export type BranchLifecycleState =
	| "active"
	| "suspended"
	| "confirmed"
	| "ruled_out"
	| "closed";

export interface V2Branch {
	id: string;
	parentId: string | null;
	name: string;
	status: BranchLifecycleState;
	hypothesisConcept: CodeableConcept;
	supportingConcepts: CodeableConcept[];
	refutingConcepts: CodeableConcept[];
	commandAlias?: string;
	createdAt: string;
}

export interface V2WorkspaceAggregate {
	id: string;
	sessionId: string;
	sourceDocumentId: string;
	activeBranchId: string | null;
	branches: V2Branch[];
	globalFacts: TypedFact[];
	closeRequested: boolean;
	completed?: boolean;
	version: number;
	eventHead?: string;
}

export type FactCertainty = "supporting" | "refuting" | "neutral";

export interface TypedFact {
	factId: string;
	targetSchema: string;
	concept?: CodeableConcept;
	values?: Record<string, unknown>;
	certainty: FactCertainty;
	provenance: {
		sourceCellId?: string;
		sourceMacroCellId?: string;
		transactionId?: string;
	};
	workspaceId?: string;
	branchId?: string;
}

export type WorkspaceOperation =
	| {
			kind: "add_fact";
			workspaceId: string;
			branchId?: string;
			fact: TypedFact;
	  }
	| {
			kind: "create_branch";
			workspaceId: string;
			name: string;
			concept: CodeableConcept;
			parentBranchId?: string;
			commandAlias?: string;
	  }
	| {
			kind: "focus_branch";
			workspaceId: string;
			branchId: string;
	  }
	| {
			kind: "branch_transition";
			workspaceId: string;
			branchId: string;
			transition: "confirm" | "rule_out" | "suspend" | "reactivate";
			reason?: string;
			actorId?: string;
			sourceCellId?: string;
	  }
	| { kind: "close"; workspaceId: string }
	| {
			kind: "complete";
			workspaceId: string;
			winningBranchId: string;
	  };

export interface CreateWorkspaceRequest {
	sessionId: string;
	sourceDocumentId: string;
	initialBranches?: Array<{
		name: string;
		hypothesisConcept: CodeableConcept;
		status?: BranchLifecycleState;
	}>;
	workspaceId?: string;
}
