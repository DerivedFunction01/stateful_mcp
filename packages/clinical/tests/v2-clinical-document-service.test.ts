import { describe, expect, it } from "bun:test";
import { createEventStore, EventStore, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { CoreClinicalEventStore } from "../src/v2/clinical/core-clinical-event-store";
import { ClinicalDocumentService } from "../src/v2/clinical/clinical-document-service";
import { ClinicalOperationCompiler } from "../src/v2/clinical/clinical-operation-compiler";
import { ClinicalSchemaAdapterRegistry } from "../src/v2/clinical/clinical-schema-adapter";
import { InMemoryClinicalDocumentProjectionStore, InMemorySignedDocumentArchive } from "../src/v2/clinical/clinical-document-types";
import { ClinicalTransactionParticipant } from "../src/v2/clinical/clinical-transaction-participant";
import { SqlClinicalDocumentProjectionStore, SqlSignedDocumentArchive } from "../src/v2/clinical/clinical-document-sql-stores";
import { TransactionCoordinator, InMemoryTransactionJournal } from "../src/v2/transactions/transaction-coordinator";
import type { MacroExecutionPlan } from "../src/v2/macros/macro-plan";

async function makeService() {
	const storage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({ session: storage, persistent: storage, schemas: new Map() });
	const schemas = new ClinicalSchemaAdapterRegistry();
	schemas.register({ schemaName: "FutureObservation", schemaVersion: 1, validateRecord: () => ({ valid: true, diagnostics: [] }) });
	const archive = new InMemorySignedDocumentArchive();
	return {
		service: new ClinicalDocumentService(new CoreClinicalEventStore(eventStore), new ClinicalOperationCompiler(schemas), new InMemoryClinicalDocumentProjectionStore(), archive),
		archive,
	};
}

async function makeSqlService() {
	const eventStorage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({ session: eventStorage, persistent: eventStorage, schemas: new Map() });
	const sql = await SqlBackend.connect("sqlite", ":memory:");
	const executor = new SqlExecutor(sql);
	const schemas = new ClinicalSchemaAdapterRegistry();
	schemas.register({ schemaName: "FutureObservation", schemaVersion: 1, validateRecord: () => ({ valid: true, diagnostics: [] }) });
	const archive = new SqlSignedDocumentArchive("sqlite", executor);
	return { service: new ClinicalDocumentService(new CoreClinicalEventStore(eventStore), new ClinicalOperationCompiler(schemas), new SqlClinicalDocumentProjectionStore("sqlite", executor), archive), archive };
}

describe("V2 clinical document service", () => {
	it("projects generic clinical records and rebuilds historical heads", async () => {
		const { service } = await makeService();
		const created = await service.initDocument({ kind: "document_initialized", documentId: "doc-1", sessionId: "session-1", patientId: "patient-1" });
		const updated = await service.appendOperations("doc-1", [{ kind: "record_upserted", documentId: "doc-1", schemaName: "FutureObservation", schemaVersion: 1, recordId: "obs-1", values: { value: 42 } }], created.version, created.eventHead!);

		expect(updated.records["obs-1"]?.values).toEqual({ value: 42 });
		const rebuilt = await service.rebuildDocument("doc-1", created.eventHead);
		expect(rebuilt.records["obs-1"]).toBeUndefined();
		expect(rebuilt.status).toBe("draft");
	});

	it("supports patch, sign, archive, amend, and void lifecycle", async () => {
		const { service, archive } = await makeService();
		const created = await service.initDocument({ kind: "document_initialized", documentId: "doc-2", sessionId: "session-2", patientId: "patient-2" });
		const updated = await service.appendOperations("doc-2", [{ kind: "record_upserted", documentId: "doc-2", schemaName: "FutureObservation", schemaVersion: 1, recordId: "obs-2", values: { value: 10 } }], created.version, created.eventHead!);
		const patched = await service.appendOperations("doc-2", [{ kind: "record_patched", documentId: "doc-2", schemaName: "FutureObservation", schemaVersion: 1, recordId: "obs-2", changes: { value: 11 } }], updated.version, updated.eventHead!);
		const signed = await service.signDocument("doc-2", "clinician-1", patched.version, patched.eventHead!);

		expect(signed.status).toBe("signed");
		expect(await archive.get("doc-2")).not.toBeNull();
		const amended = await service.amendDocument("doc-2", "Corrected observation", "clinician-1", signed.version, signed.eventHead!);
		const voided = await service.voidDocument("doc-2", "Entered on wrong patient", "clinician-1", amended.version, amended.eventHead!);
		expect(voided.status).toBe("voided");
	});

	it("commits clinical operations through the transaction participant", async () => {
		const { service } = await makeService();
		const created = await service.initDocument({ kind: "document_initialized", documentId: "doc-3", sessionId: "session-3", patientId: "patient-3" });
		const plan: MacroExecutionPlan = {
			groupId: "clinical-group",
			scope: { kind: "clinical_document", sessionId: created.sessionId, documentId: created.documentId },
			macroDefinitions: [],
			operations: [],
			links: [],
			generatedCells: [],
			clinicalOperations: [{ kind: "record_upserted", documentId: created.documentId, schemaName: "FutureObservation", schemaVersion: 1, recordId: "obs-3", values: { value: 3 } }],
			expectedVersions: [{ aggregateKind: "document", aggregateId: created.documentId, expectedVersion: created.version, expectedHead: created.eventHead }],
			fingerprint: { value: "clinical-plan-1", algorithm: "v2-plan-fingerprint-v1" },
			diagnostics: [],
		};
		const coordinator = new TransactionCoordinator({ journal: new InMemoryTransactionJournal() });
		const participant = new ClinicalTransactionParticipant(service);
		const prepared = await coordinator.prepare({ idempotencyKey: "clinical-tx-1", sourceCellId: "cell-1", sourceCellRevision: 1, plan, participants: [participant] });
		await coordinator.commit(prepared.transactionId, [participant]);

		expect((await service.getDocument(created.documentId))?.records["obs-3"]?.values).toEqual({ value: 3 });
	});

	it("persists the clinical projection and signed archive through SQL stores", async () => {
		const { service, archive } = await makeSqlService();
		const created = await service.initDocument({ kind: "document_initialized", documentId: "doc-sql", sessionId: "session-sql", patientId: "patient-sql" });
		const signed = await service.signDocument(created.documentId, "clinician-sql", created.version, created.eventHead!);

		expect((await service.getDocument(created.documentId))?.status).toBe("signed");
		expect((await archive.get(created.documentId))?.documentHead).toBe(signed.eventHead);
	});
});
