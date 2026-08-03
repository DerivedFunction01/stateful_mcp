import type { ClinicalEventRecord } from "./clinical-event-types";
import type { ClinicalDocumentReadModel } from "./clinical-document-types";

export function reduceClinicalEvents(records: readonly ClinicalEventRecord[]): ClinicalDocumentReadModel {
	const initialized = records.find((record) => record.payload.kind === "clinical_document_initialized");
	if (!initialized || initialized.payload.kind !== "clinical_document_initialized") throw new Error("Clinical document initialization event is missing");
	let document: ClinicalDocumentReadModel = {
		documentId: initialized.payload.documentId,
		sessionId: initialized.payload.sessionId,
		patientId: initialized.payload.patientId,
		status: "draft",
		amendmentNotes: [],
		records: {},
		version: 1,
		eventHead: initialized.commitId,
	};
	if (initialized.payload.initialState) document = { ...document, records: { initial: { recordId: "initial", schemaName: "Note", schemaVersion: 1, values: initialized.payload.initialState, version: 1 } } };
	for (const record of records) {
		if (record === initialized || record.voided) continue;
		document = reduceClinicalEvent(document, record);
		document.version += 1;
		document.eventHead = record.commitId;
	}
	return document;
}

export function reduceClinicalEvent(document: ClinicalDocumentReadModel, record: ClinicalEventRecord): ClinicalDocumentReadModel {
	const next = structuredClone(document) as ClinicalDocumentReadModel;
	const event = record.payload;
	switch (event.kind) {
		case "clinical_document_initialized":
			return next;
		case "clinical_record_upserted":
			next.records[event.recordId] = { recordId: event.recordId, schemaName: event.schemaName, schemaVersion: event.schemaVersion, values: structuredClone(event.values), version: (next.records[event.recordId]?.version ?? 0) + 1 };
			return next;
		case "clinical_record_patched": {
			const existing = next.records[event.recordId];
			if (!existing) throw new Error(`Clinical record '${event.recordId}' was not found`);
			existing.values = { ...existing.values, ...structuredClone(event.changes) };
			existing.version += 1;
			return next;
		}
		case "clinical_record_removed":
			if (next.records[event.recordId]) next.records[event.recordId]!.removed = true;
			return next;
		case "clinical_document_signed":
			next.status = "signed";
			next.signedBy = event.signedBy;
			next.signedAt = event.signedAt;
			return next;
		case "clinical_document_amended":
			next.status = "amended";
			next.amendmentNotes.push(event.amendmentNote);
			return next;
		case "clinical_document_voided":
			next.status = "voided";
			return next;
	}
}
