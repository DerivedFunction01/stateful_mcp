import type { EventStore } from "@stateful-mcp/core";
import { CoreStreamEventStore } from "../events/core-stream-event-store";
import type {
	StreamEventCodec,
	StreamEventMetadata,
} from "../events/stream-event-store";
import type {
	ClinicalEvent,
	ClinicalEventRecord,
} from "./clinical-event-types";

const SCHEMA_NAME = "v2_clinical_events";

const codec: StreamEventCodec<ClinicalEvent, ClinicalEventRecord> = {
	schemaName: SCHEMA_NAME,
	encode(
		event: ClinicalEvent,
		metadata?: StreamEventMetadata,
	): Record<string, unknown> {
		return {
			...event,
			macroBatchId: metadata?.idempotencyKey,
			_v2EventMetadata: metadata,
		};
	},
	decode(record, context): ClinicalEventRecord | null {
		const {
			event_id: eventId,
			macroBatchId: _macroBatchId,
			_v2EventMetadata: _metadata,
			voided,
			voidReason,
			voidedBy,
			voidedAt,
			...payload
		} = record;
		if (
			typeof payload.kind !== "string" ||
			typeof payload.documentId !== "string"
		)
			return null;
		return {
			eventId: String(eventId),
			streamId: context.streamId,
			documentId: String(payload.documentId),
			commitId: context.commitId,
			parentCommitId: context.parentCommitId,
			payload: payload as ClinicalEvent,
			voided: voided === true,
			voidReason: typeof voidReason === "string" ? voidReason : undefined,
			voidedBy: typeof voidedBy === "string" ? voidedBy : undefined,
			voidedAt: typeof voidedAt === "string" ? voidedAt : undefined,
			mutationType: context.mutation?.type,
			mutationParentIds: context.mutation?.mutationParentIds,
			beforeData: context.mutation?.beforeData,
		};
	},
	logicalKey(event: ClinicalEvent): string | null {
		if (event.kind === "clinical_document_initialized") return "document:root";
		if ("recordId" in event)
			return `record:${event.schemaName}:${event.recordId}`;
		if (event.kind === "clinical_document_signed") return "document:lifecycle";
		if (event.kind === "clinical_document_amended") return "document:lifecycle";
		if (event.kind === "clinical_document_voided") return "document:lifecycle";
		return null;
	},
};

export class CoreClinicalEventStore extends CoreStreamEventStore<
	ClinicalEvent,
	ClinicalEventRecord
> {
	constructor(eventStore: EventStore) {
		super(eventStore, codec);
	}
}
