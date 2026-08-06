import type { MacroExecutionPlan } from "../macros/macro-plan";

export type TransactionStatus =
	| "prepared"
	| "staging"
	| "events_committed"
	| "recovery_required"
	| "committed"
	| "aborted"
	| "failed";

export type TransactionParticipantKind =
	| "clinical_events"
	| "workspace_events"
	| "cells"
	| "projection";

export interface EventCommitReceipt {
	commitId: string;
	eventIds: readonly string[];
	/** Identifies store-backed receipts that do not represent an EventStore commit. */
	receiptKind?: "event_stream" | "cell_store";
}

/** Confirmation that a projection advanced to a specific committed head. */
export interface ProjectionReceipt {
	/** Head commit the projection was built from (must equal the event receipt head). */
	projectedHead: string;
	/** Aggregates whose projected state advanced, keyed by aggregateId. */
	aggregates?: Record<string, { version: number; head: string }>;
}

export interface TransactionParticipantContext {
	transactionId: string;
	idempotencyKey: string;
	plan: MacroExecutionPlan;
}

export interface TransactionParticipant {
	participantId: string;
	kind: TransactionParticipantKind;
	stage?(context: TransactionParticipantContext): Promise<void>;
	appendEvents?(
		context: TransactionParticipantContext,
	): Promise<EventCommitReceipt>;
	finalize?(context: TransactionParticipantContext): Promise<void>;
	project?(
		context: TransactionParticipantContext,
	): Promise<ProjectionReceipt | undefined>;
}

export interface TransactionParticipantState {
	participantId: string;
	kind: TransactionParticipantKind;
	status: "pending" | "staged" | "committed" | "finalized" | "projected";
	receipt?: EventCommitReceipt;
	projectionHead?: string;
	error?: string;
}

export interface MacroTransaction {
	transactionId: string;
	idempotencyKey: string;
	sourceCellId: string;
	sourceCellRevision: number;
	plan: MacroExecutionPlan;
	status: TransactionStatus;
	participants: TransactionParticipantState[];
	error?: string;
	recoveryAttempts: number;
	createdAt: string;
	updatedAt: string;
}

export interface PrepareTransactionRequest {
	idempotencyKey: string;
	sourceCellId: string;
	sourceCellRevision: number;
	plan: MacroExecutionPlan;
	participants: readonly TransactionParticipant[];
	skipSourceCellRevision?: boolean;
}

export interface CommittedTransaction {
	transactionId: string;
	status: "committed";
	participants: readonly TransactionParticipantState[];
}

export interface PreparedTransaction {
	transactionId: string;
	status: TransactionStatus;
	planFingerprint: string;
}

export interface AbortedTransaction {
	transactionId: string;
	status: "aborted";
	reason: string;
}

export interface RecoveryQuery {
	sourceCellId?: string;
	statuses?: readonly TransactionStatus[];
}

export interface RecoveryResult {
	transactionId: string;
	status: TransactionStatus;
	error?: string;
}

export interface TransactionJournal {
	get(transactionId: string): Promise<MacroTransaction | null>;
	getByIdempotencyKey(idempotencyKey: string): Promise<MacroTransaction | null>;
	put(transaction: MacroTransaction): Promise<void>;
	list(query?: RecoveryQuery): Promise<MacroTransaction[]>;
}

export interface AggregateVersionExpectation {
	aggregateKind: string;
	aggregateId: string;
	expectedVersion: number;
	expectedHead?: string;
}

export type AggregateVersionReader = (
	expectation: AggregateVersionExpectation,
) => Promise<{ version: number; head?: string }>;

export type SourceCellRevisionReader = (cellId: string) => Promise<number>;
