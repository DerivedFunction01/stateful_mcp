import type { ProjectionContext, ProjectionHandler } from "./projection-registry";
import type { ClinicalDocumentService } from "../clinical/clinical-document-service";
import type { WorkspaceService } from "../workspaces/workspace-service";
import { SyncEngine } from "../sync/sync-engine";

/**
 * Post-commit projection handler for clinical documents.
 * Rebuilds the document from committed events and saves to the projection store.
 */
export function createClinicalProjection(
	service: ClinicalDocumentService,
): ProjectionHandler {
	return {
		kind: "clinical_events" as const,
		async onCommitted(context: ProjectionContext): Promise<void> {
			for (const state of context.participantStates) {
				if (state.kind !== "clinical_events") continue;
				const documentId = context.plan.scope.documentId;
				if (!documentId || !state.receipt?.commitId) continue;
				await service.rebuildDocument(documentId, state.receipt.commitId);
			}
		},
	};
}

/**
 * Post-commit projection handler for workspace aggregates.
 * Rebuilds the workspace from committed events.
 */
export function createWorkspaceProjection(
	service: WorkspaceService,
): ProjectionHandler {
	return {
		kind: "workspace_events" as const,
		async onCommitted(context: ProjectionContext): Promise<void> {
			for (const state of context.participantStates) {
				if (state.kind !== "workspace_events") continue;
				const workspaceId = context.plan.scope.workspaceId;
				if (!workspaceId) continue;
				await service.rebuildFromEvents(workspaceId);
			}
		},
	};
}

/**
 * Passive sync projection: after clinical events commit, evaluate sync rules
 * against the clinical document projection and apply resulting workspace fact
 * operations. Runs only when sync config is present in the context.
 */
export function createSyncProjection(
	syncEngine: SyncEngine,
	clinicalService: ClinicalDocumentService,
	workspaceService: WorkspaceService,
): ProjectionHandler {
	return {
		kind: "clinical_events" as const,
		async onCommitted(context: ProjectionContext): Promise<void> {
			if (!context.syncConfig?.rules?.length) return;
			for (const state of context.participantStates) {
				if (state.kind !== "clinical_events") continue;
				const documentId = context.plan.scope.documentId;
				if (!documentId || !state.receipt?.commitId) continue;
				const document = await clinicalService.getDocument(documentId);
				if (!document) continue;
				const ops = syncEngine.evaluate(document);
				if (!ops.length) continue;
				const workspaceId = context.plan.scope.workspaceId;
				if (!workspaceId) continue;
				const workspace = await workspaceService.getWorkspace(workspaceId);
				if (!workspace) continue;
				const addOps = ops.map((op) => ({
					kind: "add_fact" as const,
					workspaceId,
					fact: {
						...op.values,
						factId: `${op.targetSchema}:${op.provenance.ruleId ?? "manual"}`,
						targetSchema: op.targetSchema,
						certainty: "supporting" as const,
						provenance: op.provenance as Record<string, unknown> as import("../workspaces/workspace-types").TypedFact["provenance"],
					},
				}));
				await workspaceService.applyOperations(
					workspaceId,
					addOps,
					workspace.version,
					workspace.eventHead,
				);
			}
		},
	};
}