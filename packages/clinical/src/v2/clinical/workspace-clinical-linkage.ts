import type { V2Branch, V2WorkspaceAggregate } from "../workspaces/workspace-types";
import type { ClinicalOperation } from "./clinical-operation";

export function clinicalOperationsFromWorkspaceCompletion(input: {
	documentId: string;
	workspace: V2WorkspaceAggregate;
	transactionId?: string;
	sourceCellId?: string;
}): ClinicalOperation[] {
	const confirmed = input.workspace.branches.find((branch) => branch.id === input.workspace.activeBranchId || branch.status === "confirmed");
	const operations: ClinicalOperation[] = [];
	if (confirmed) {
		operations.push({ kind: "record_upserted", documentId: input.documentId, schemaName: "PrimaryDiagnosis", schemaVersion: 1, recordId: `primary:${confirmed.id}`, values: { concept: confirmed.hypothesisConcept, status: "primary", workspaceId: input.workspace.id }, provenance: { transactionId: input.transactionId, sourceCellId: input.sourceCellId, logicalRecordKey: `diagnosis:${confirmed.id}` } });
	}
	for (const branch of input.workspace.branches.filter((item) => item.id !== confirmed?.id)) {
		operations.push({ kind: "record_upserted", documentId: input.documentId, schemaName: "DifferentialDiagnosis", schemaVersion: 1, recordId: `differential:${branch.id}`, values: { concept: branch.hypothesisConcept, status: "differential", workspaceId: input.workspace.id }, provenance: { transactionId: input.transactionId, sourceCellId: input.sourceCellId, logicalRecordKey: `diagnosis:${branch.id}` } });
	}
	return operations;
}
