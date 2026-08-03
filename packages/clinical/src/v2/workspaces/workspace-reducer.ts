import type {
	WorkspaceEvent,
	WorkspaceEventRecord,
} from "./workspace-event-types";
import type { V2Branch, V2WorkspaceAggregate } from "./workspace-types";

export function reduceWorkspaceEvents(
	records: readonly WorkspaceEventRecord[],
): V2WorkspaceAggregate {
	const initialized = records.find(
		(record) => record.payload.kind === "workspace_initialized",
	);
	if (!initialized || initialized.payload.kind !== "workspace_initialized")
		throw new Error("Workspace initialization event is missing");

	let aggregate: V2WorkspaceAggregate = {
		id: initialized.payload.workspaceId,
		sessionId: initialized.payload.sessionId,
		sourceDocumentId: initialized.payload.sourceDocumentId,
		activeBranchId: initialized.payload.activeBranchId || null,
		branches: structuredClone(initialized.payload.branches) as V2Branch[],
		globalFacts: structuredClone(initialized.payload.globalFacts),
		closeRequested: false,
		version: 1,
		eventHead: initialized.commitId,
	};

	for (const record of records) {
		if (record === initialized) continue;
		if (record.voided) continue;
		aggregate = reduceWorkspaceEvent(aggregate, record.payload);
		aggregate.version += 1;
		aggregate.eventHead = record.commitId;
	}
	return aggregate;
}

export function reduceWorkspaceEvent(
	aggregate: V2WorkspaceAggregate,
	event: WorkspaceEvent,
): V2WorkspaceAggregate {
	const next = structuredClone(aggregate) as V2WorkspaceAggregate;
	switch (event.kind) {
		case "workspace_initialized":
			return next;
		case "branch_created":
			next.branches.push({
				id: event.branchId,
				parentId: event.parentBranchId,
				name: event.name,
				status: "active",
				hypothesisConcept: event.hypothesisConcept,
				commandAlias: event.commandAlias,
				supportingConcepts: [],
				refutingConcepts: [],
				createdAt: new Date().toISOString(),
			});
			return next;
		case "branch_lifecycle_transitioned": {
			const branch = next.branches.find((item) => item.id === event.branchId);
			if (!branch)
				throw new Error(
					`Branch '${event.branchId}' was not found during replay`,
				);
			branch.status = event.toStatus;
			return next;
		}
		case "concept_added": {
			const branch = next.branches.find((item) => item.id === event.branchId);
			if (!branch)
				throw new Error(
					`Branch '${event.branchId}' was not found during replay`,
				);
			if (event.fact.concept)
				(event.conceptType === "refuting"
					? branch.refutingConcepts
					: branch.supportingConcepts
				).push(event.fact.concept);
			return next;
		}
		case "global_fact_added":
			next.globalFacts.push(event.fact);
			return next;
		case "global_fact_removed":
			next.globalFacts = next.globalFacts.filter(
				(fact) => fact.factId !== event.factId,
			);
			return next;
		case "workspace_close_requested":
			next.closeRequested = true;
			return next;
		case "workspace_completed":
			next.completed = true;
			return next;
	}
}
