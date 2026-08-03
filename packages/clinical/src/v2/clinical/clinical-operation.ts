import type { CodeableConcept } from "../../schemas/shared";
import type { TypedValue } from "../values/typed-value";
import type { FactCertainty } from "../workspaces/workspace-types";

export interface ClinicalProvenance {
	actorId?: string;
	sourceCellId?: string;
	sourceCellRevision?: number;
	operationId?: string;
	transactionId?: string;
	logicalRecordKey?: string;
	sourcePath?: string;
	sourceMacroId?: string;
}

export type ClinicalOperation =
	| {
			kind: "document_initialized";
			documentId: string;
			sessionId: string;
			patientId: string;
			initialState?: Record<string, unknown>;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "record_upserted";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			values: Record<string, unknown>;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "record_patched";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			changes: Record<string, unknown>;
			expectedRecordVersion?: number;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "record_removed";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			reason?: string;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "document_signed";
			documentId: string;
			signedBy: string;
			signedAt: string;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "document_amended";
			documentId: string;
			amendmentNote: string;
			provenance?: ClinicalProvenance;
	  }
	| {
			kind: "document_voided";
			documentId: string;
			reason: string;
			provenance?: ClinicalProvenance;
	  };

export type ClinicalOperationValue =
	| TypedValue
	| CodeableConcept
	| FactCertainty;
