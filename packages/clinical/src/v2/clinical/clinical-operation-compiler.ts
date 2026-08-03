import type { ClinicalEvent } from "./clinical-event-types";
import { ClinicalSchemaAdapterRegistry } from "./clinical-schema-adapter";
import type { ClinicalOperation } from "./clinical-operation";
import type { MacroTargetOperation } from "../macros/macro-plan";

export class ClinicalOperationCompiler {
	constructor(private readonly schemas: ClinicalSchemaAdapterRegistry) {}

	compile(operation: ClinicalOperation): ClinicalEvent {
		switch (operation.kind) {
			case "document_initialized":
				return { kind: "clinical_document_initialized", documentId: operation.documentId, sessionId: operation.sessionId, patientId: operation.patientId, initialState: operation.initialState };
			case "record_upserted": {
				const adapter = this.schemas.get(operation.schemaName, operation.schemaVersion);
				const validation = adapter.validateRecord(operation.values);
				if (!validation.valid) throw new Error(validation.diagnostics.join("; "));
				return { kind: "clinical_record_upserted", documentId: operation.documentId, schemaName: operation.schemaName, schemaVersion: operation.schemaVersion, recordId: operation.recordId, values: adapter.normalizeRecord ? adapter.normalizeRecord(operation.values) : operation.values, provenance: operation.provenance };
			}
			case "record_patched": {
				const adapter = this.schemas.get(operation.schemaName, operation.schemaVersion);
				const validation = adapter.validateRecord(operation.changes);
				if (!validation.valid) throw new Error(validation.diagnostics.join("; "));
				return { kind: "clinical_record_patched", documentId: operation.documentId, schemaName: operation.schemaName, schemaVersion: operation.schemaVersion, recordId: operation.recordId, changes: adapter.normalizeRecord ? adapter.normalizeRecord(operation.changes) : operation.changes, provenance: operation.provenance };
			}
			case "record_removed":
				this.schemas.get(operation.schemaName, operation.schemaVersion);
				return { kind: "clinical_record_removed", documentId: operation.documentId, schemaName: operation.schemaName, schemaVersion: operation.schemaVersion, recordId: operation.recordId, reason: operation.reason, provenance: operation.provenance };
			case "document_signed":
				return { kind: "clinical_document_signed", documentId: operation.documentId, signedBy: operation.signedBy, signedAt: operation.signedAt, provenance: operation.provenance };
			case "document_amended":
				return { kind: "clinical_document_amended", documentId: operation.documentId, amendmentNote: operation.amendmentNote, provenance: operation.provenance };
			case "document_voided":
				return { kind: "clinical_document_voided", documentId: operation.documentId, reason: operation.reason, provenance: operation.provenance };
		}
	}

	compileMacroTargets(documentId: string, operations: readonly MacroTargetOperation[], schemaVersion = 1): ClinicalOperation[] {
		return operations.map((operation) => ({
			kind: "record_patched",
			documentId,
			schemaName: operation.targetSchema,
			schemaVersion,
			recordId: operation.operationId,
			changes: { [operation.targetPath]: operation.value },
			provenance: { operationId: operation.operationId, sourceCellId: operation.cellRef },
		}));
	}
}
