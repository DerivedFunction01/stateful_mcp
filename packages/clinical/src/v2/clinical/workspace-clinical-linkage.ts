import type {
	V2Branch,
	V2WorkspaceAggregate,
} from "../workspaces/workspace-types";
import type { ClinicalOperation } from "./clinical-operation";

export function clinicalOperationsFromWorkspaceCompletion(input: {
	documentId: string;
	workspace: V2WorkspaceAggregate;
	transactionId?: string;
	sourceCellId?: string;
}): ClinicalOperation[] {
	const confirmed = input.workspace.branches.find(
		(branch) =>
			branch.id === input.workspace.activeBranchId ||
			branch.status === "confirmed",
	);
	const operations: ClinicalOperation[] = [];
	if (confirmed) {
		operations.push({
			kind: "record_upserted",
			documentId: input.documentId,
			schemaName: "PrimaryDiagnosis",
			schemaVersion: 1,
			recordId: `primary:${confirmed.id}`,
			values: {
				id: confirmed.id,
				diagnosis: confirmed.hypothesisConcept,
			},
			provenance: {
				transactionId: input.transactionId,
				sourceCellId: input.sourceCellId,
				logicalRecordKey: `diagnosis:${confirmed.id}`,
			},
		});
	}
	const differentials = input.workspace.branches.filter(
		(item) => item.id !== confirmed?.id,
	);
	differentials.forEach((branch, index) => {
		operations.push({
			kind: "record_upserted",
			documentId: input.documentId,
			schemaName: "DifferentialDiagnosis",
			schemaVersion: 1,
			recordId: `differential:${branch.id}`,
			values: {
				id: branch.id,
				rank: index + 1,
				diagnosis: branch.hypothesisConcept,
				confidence: confidenceForBranch(branch),
				status: statusForBranch(branch),
			},
			provenance: {
				transactionId: input.transactionId,
				sourceCellId: input.sourceCellId,
				logicalRecordKey: `diagnosis:${branch.id}`,
			},
		});
	});
	return operations;
}

function confidenceForBranch(
	branch: V2Branch,
): "confirmed" | "suspected" | "refuted" {
	if (branch.status === "confirmed") return "confirmed";
	if (branch.status === "ruled_out") return "refuted";
	return "suspected";
}

function statusForBranch(branch: V2Branch): "active" | "ruled_out" {
	return branch.status === "ruled_out" ? "ruled_out" : "active";
}
