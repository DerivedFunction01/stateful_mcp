import type { BranchStatus } from "../commands/command-syntax-profile";
import type { CodeableConcept } from "../schemas/schemas-interface/shared";
import type { Branch, TypedFact } from "./workspace-types";

export interface WorkspaceEventMetadata {
	logicalKey: string;
	logicalRecordKey?: string;
	operationId?: string;
	actorId?: string;
	authorId?: string;
	scope?: { level: "global" | "session" | "user"; userId?: string };
	reason?: string;
	sourceCellId?: string;
	transactionId?: string;
}

export type WorkspaceEvent =
	| {
			kind: "workspace_initialized";
			workspaceId: string;
			sessionId: string;
			sourceDocumentId: string;
			branches: Branch[];
			activeBranchId: string;
			globalFacts: TypedFact[];
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "branch_created";
			workspaceId: string;
			branchId: string;
			name: string;
			parentBranchId: string | null;
			hypothesisConcept: CodeableConcept;
			commandAlias?: string;
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "branch_lifecycle_transitioned";
			workspaceId: string;
			branchId: string;
			fromStatus: BranchStatus;
			toStatus: BranchStatus;
			reason?: string;
			actorId?: string;
			sourceCellId?: string;
			transactionId?: string;
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "concept_added";
			workspaceId: string;
			branchId: string;
			fact: TypedFact;
			conceptType: "supporting" | "refuting";
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "global_fact_added";
			workspaceId: string;
			fact: TypedFact;
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "global_fact_removed";
			workspaceId: string;
			factId: string;
			reason?: string;
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "workspace_close_requested";
			workspaceId: string;
			metadata?: WorkspaceEventMetadata;
	  }
	| {
			kind: "workspace_completed";
			workspaceId: string;
			winningBranchId: string;
			winningBranchName: string;
			metadata?: WorkspaceEventMetadata;
	  };

export interface WorkspaceEventRecord {
	eventId: string;
	workspaceId: string;
	commitId: string;
	parentCommitId: string | null;
	payload: WorkspaceEvent;
	voided?: boolean;
	voidReason?: string;
	voidedBy?: string;
	voidedAt?: string;
	mutationType?: "add" | "update" | "remove";
	mutationParentIds?: string[];
	beforeData?: Record<string, unknown>;
}
