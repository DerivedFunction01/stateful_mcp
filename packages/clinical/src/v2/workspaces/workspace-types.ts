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
	sourceDocumentId: string;
	activeBranchId: string | null;
	branches: V2Branch[];
	closeRequested: boolean;
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
	  }
	| { kind: "close"; workspaceId: string };
