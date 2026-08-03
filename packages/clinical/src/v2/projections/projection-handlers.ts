import type { ClinicalDocumentService } from "../clinical/clinical-document-service";
import type { SyncApplicationService } from "../sync/sync-application-service";
import type { SyncEngine } from "../sync/sync-engine";
import type { WorkspaceService } from "../workspaces/workspace-service";
import type {
	ProjectionContext,
	ProjectionHandler,
} from "./projection-registry";

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
	_application?: SyncApplicationService,
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
				// Evaluation is intentionally passive. Applying the returned results is
				// an explicit command through SyncApplicationService.
				void ops;
			}
		},
	};
}
