import type {
	StreamEventStore,
	StreamPatchTarget,
} from "../events/stream-event-store";
import type { MacroTargetOperation } from "../macros/macro-plan";
import { reduceClinicalEvents } from "./clinical-document-reducer";
import type {
	ClinicalDocumentProjectionStore,
	ClinicalDocumentReadModel,
	ClinicalDocumentRecord,
	SignedDocumentArchive,
	SignedDocumentRecord,
} from "./clinical-document-types";
import type {
	ClinicalEvent,
	ClinicalEventRecord,
} from "./clinical-event-types";
import type { ClinicalOperation } from "./clinical-operation";
import type { ClinicalOperationCompiler } from "./clinical-operation-compiler";

export class ClinicalDocumentConflictError extends Error {}

export interface PreparedClinicalMutation {
	documentId: string;
	sessionId: string;
	parentCommitId: string;
	operations: ClinicalOperation[];
	events: ClinicalEvent[];
	baseVersion: number;
}

export class ClinicalDocumentService {
	constructor(
		private readonly events: StreamEventStore<
			ClinicalEvent,
			ClinicalEventRecord
		>,
		private readonly compiler: ClinicalOperationCompiler,
		private readonly projections: ClinicalDocumentProjectionStore,
		private readonly archive?: SignedDocumentArchive,
	) {}

	async initDocument(
		operation: Extract<ClinicalOperation, { kind: "document_initialized" }>,
	): Promise<ClinicalDocumentReadModel> {
		const committed = await this.events.initialize(
			operation.documentId,
			operation.sessionId,
			this.compiler.compile(operation),
		);
		const document = reduceClinicalEvents(committed.records);
		await this.projections.save(document);
		return document;
	}

	getDocument(documentId: string): Promise<ClinicalDocumentReadModel | null> {
		return this.projections.get(documentId);
	}

	async getActiveRecords(
		documentId: string,
	): Promise<ClinicalDocumentRecord[]> {
		const document = await this.projections.get(documentId);
		return Object.values(document?.records ?? {}).filter(
			(record) => !record.removed,
		);
	}

	listDocuments(sessionId: string): Promise<ClinicalDocumentReadModel[]> {
		return this.projections.list(sessionId);
	}

	async compileMacroTargets(
		documentId: string,
		operations: readonly MacroTargetOperation[],
		writePolicy?: import("../values/merge").ClinicalWritePolicy,
	): Promise<ClinicalOperation[]> {
		const document = await this.projections.get(documentId);
		const existing = document
			? Object.fromEntries(
					Object.entries(document.records)
						.filter(([, record]) => !record.removed)
						.map(([recordId, record]) => [recordId, { values: record.values }]),
				)
			: undefined;
		return this.compiler.compileMacroTargets(documentId, operations, {
			writePolicy,
			existing,
		});
	}

	async appendOperations(
		documentId: string,
		operations: ClinicalOperation[],
		expectedVersion: number,
		expectedHead: string,
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<ClinicalDocumentReadModel> {
		const prepared = await this.prepareOperations(
			documentId,
			operations,
			expectedVersion,
			expectedHead,
		);
		const committed = await this.appendPrepared(
			prepared,
			transactionId,
			idempotencyKey,
		);
		return this.finalizePrepared(prepared, committed.commitId);
	}

	async prepareOperations(
		documentId: string,
		operations: ClinicalOperation[],
		expectedVersion: number,
		expectedHead: string,
	): Promise<PreparedClinicalMutation> {
		const current = await this.requireDocument(documentId);
		this.assertHead(current, expectedVersion, expectedHead);
		return {
			documentId,
			sessionId: current.sessionId,
			parentCommitId: expectedHead,
			operations,
			events: operations.map((operation) => this.compiler.compile(operation)),
			baseVersion: expectedVersion,
		};
	}

	appendPrepared(
		prepared: PreparedClinicalMutation,
		transactionId?: string,
		idempotencyKey?: string,
	): Promise<{ commitId: string; eventIds: string[] }> {
		return this.events
			.append({
				streamId: prepared.documentId,
				sessionId: prepared.sessionId,
				parentCommitId: prepared.parentCommitId,
				events: prepared.events,
				transactionId,
				idempotencyKey,
			})
			.then((result) => ({
				commitId: result.commitId,
				eventIds: result.records.map((record) => record.eventId),
			}));
	}

	async finalizePrepared(
		prepared: PreparedClinicalMutation,
		commitId: string,
	): Promise<ClinicalDocumentReadModel> {
		const document = reduceClinicalEvents(
			await this.events.project(
				prepared.documentId,
				prepared.sessionId,
				commitId,
			),
		);
		await this.projections.save(document);
		return document;
	}

	async signDocument(
		documentId: string,
		signedBy: string,
		expectedVersion: number,
		expectedHead: string,
		signedAt = new Date().toISOString(),
	): Promise<ClinicalDocumentReadModel> {
		const document = await this.appendOperations(
			documentId,
			[{ kind: "document_signed", documentId, signedBy, signedAt }],
			expectedVersion,
			expectedHead,
		);
		if (this.archive && document.eventHead) {
			const record: SignedDocumentRecord = {
				documentId,
				sessionId: document.sessionId,
				patientId: document.patientId,
				documentVersion: document.version,
				documentHead: document.eventHead,
				eventRange: { from: document.eventHead, to: document.eventHead },
				transactionIds: [],
				provenance: { actorId: signedBy, signedAt },
				documentSnapshot: structuredClone(document),
				createdAt: new Date().toISOString(),
			};
			await this.archive.archive(record);
		}
		return document;
	}

	amendDocument(
		documentId: string,
		amendmentNote: string,
		actorId: string,
		expectedVersion: number,
		expectedHead: string,
	): Promise<ClinicalDocumentReadModel> {
		return this.appendOperations(
			documentId,
			[
				{
					kind: "document_amended",
					documentId,
					amendmentNote,
					provenance: { actorId },
				},
			],
			expectedVersion,
			expectedHead,
		);
	}

	voidDocument(
		documentId: string,
		reason: string,
		actorId: string,
		expectedVersion: number,
		expectedHead: string,
	): Promise<ClinicalDocumentReadModel> {
		return this.appendOperations(
			documentId,
			[
				{
					kind: "document_voided",
					documentId,
					reason,
					provenance: { actorId },
				},
			],
			expectedVersion,
			expectedHead,
		);
	}

	async patchEvent(
		target: StreamPatchTarget,
		patch: Record<string, unknown>,
	): Promise<ClinicalDocumentReadModel> {
		const document = await this.requireDocument(target.streamId);
		if (document.eventHead !== target.expectedHead)
			throw new ClinicalDocumentConflictError(
				`Clinical document '${target.streamId}' has a stale patch head`,
			);
		const committed = await this.events.patch(target, patch);
		const projected = reduceClinicalEvents(
			await this.events.project(
				target.streamId,
				target.sessionId,
				committed.commitId,
			),
		);
		await this.projections.save(projected);
		return projected;
	}

	async rebuildDocument(
		documentId: string,
		head?: string,
	): Promise<ClinicalDocumentReadModel> {
		const current = await this.requireDocument(documentId);
		const selectedHead = head ?? current.eventHead;
		if (!selectedHead)
			throw new Error(`Clinical document '${documentId}' has no event head`);
		const document = reduceClinicalEvents(
			await this.events.project(documentId, current.sessionId, selectedHead),
		);
		document.eventHead = selectedHead;
		await this.projections.save(document);
		return document;
	}

	private async requireDocument(
		documentId: string,
	): Promise<ClinicalDocumentReadModel> {
		const document = await this.projections.get(documentId);
		if (!document)
			throw new Error(`Clinical document '${documentId}' was not found`);
		return document;
	}

	private assertHead(
		document: ClinicalDocumentReadModel,
		expectedVersion: number,
		expectedHead: string,
	): void {
		if (
			document.version !== expectedVersion ||
			document.eventHead !== expectedHead
		)
			throw new ClinicalDocumentConflictError(
				`Clinical document '${document.documentId}' is stale`,
			);
		if (document.status === "voided")
			throw new Error("Voided clinical document is immutable");
	}
}
