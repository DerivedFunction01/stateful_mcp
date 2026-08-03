import type {
	StreamEventMetadata,
	StreamEventRecord,
} from "../events/stream-event-store";
import type { ClinicalProvenance } from "./clinical-operation";

export type ClinicalEvent =
	| {
			kind: "clinical_document_initialized";
			documentId: string;
			sessionId: string;
			patientId: string;
			initialState?: Record<string, unknown>;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_record_upserted";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			values: Record<string, unknown>;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_record_patched";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			changes: Record<string, unknown>;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_record_removed";
			documentId: string;
			schemaName: string;
			schemaVersion: number;
			recordId: string;
			reason?: string;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_document_signed";
			documentId: string;
			signedBy: string;
			signedAt: string;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_document_amended";
			documentId: string;
			amendmentNote: string;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  }
	| {
			kind: "clinical_document_voided";
			documentId: string;
			reason: string;
			provenance?: ClinicalProvenance;
			metadata?: StreamEventMetadata;
	  };

export type ClinicalEventRecord = StreamEventRecord<ClinicalEvent> & {
	documentId: string;
};
