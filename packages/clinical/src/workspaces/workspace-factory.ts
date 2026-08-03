import type {
	CreateWorkspaceRequest,
	Branch,
	WorkspaceAggregate,
} from "./workspace-types";

export function createWorkspace(
	request: CreateWorkspaceRequest,
	now = new Date().toISOString(),
): WorkspaceAggregate {
	const workspaceId = request.workspaceId ?? `work_${crypto.randomUUID()}`;
	const initialBranches = request.initialBranches?.length
		? request.initialBranches
		: [
				{
					name: "Hypothesis",
					hypothesisConcept: {
						conceptId: "hypothesis_default",
						display: "Hypothesis",
					},
				},
			];
	const branches: Branch[] = initialBranches.map((branch, index) => ({
		id: `branch_${workspaceId}_${index}_${crypto.randomUUID()}`,
		parentId: null,
		name: branch.name,
		status: branch.status ?? (index === 0 ? "active" : "suspended"),
		hypothesisConcept: branch.hypothesisConcept,
		supportingConcepts: [],
		refutingConcepts: [],
		createdAt: now,
	}));

	return {
		id: workspaceId,
		sessionId: request.sessionId,
		sourceDocumentId: request.sourceDocumentId,
		activeBranchId: branches[0]?.id ?? null,
		branches,
		globalFacts: [],
		closeRequested: false,
		version: 1,
	};
}
