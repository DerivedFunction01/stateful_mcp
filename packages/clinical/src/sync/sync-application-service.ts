import type { WorkspaceService } from "../workspaces/workspace-service";
import type {
	TypedFact,
	WorkspaceOperation,
} from "../workspaces/workspace-types";
import type { SyncResult } from "./sync-rule-config";

/** Explicitly applies evaluated sync results to a workspace. */
export class SyncApplicationService {
	constructor(private readonly workspaceService: WorkspaceService) {}

	async apply(
		workspaceId: string,
		results: readonly SyncResult[],
		transactionId?: string,
	): Promise<void> {
		if (!results.length) return;
		const workspace = await this.workspaceService.getWorkspace(workspaceId);
		if (!workspace) throw new Error(`Workspace '${workspaceId}' was not found`);
		const operations: WorkspaceOperation[] = results.map((result) => {
			const branchId =
				result.targetBranchId === "active"
					? (workspace.activeBranchId ?? undefined)
					: result.targetBranchId;
			if (result.operation === "remove_fact") {
				return {
					kind: "remove_fact",
					workspaceId,
					factId: result.factId!,
					reason: "Source clinical record removed",
				};
			}
			const fact: TypedFact = {
				factId:
					result.factId ??
					`${result.targetSchema}:${result.provenance.ruleId ?? "sync"}`,
				targetSchema: result.targetSchema,
				concept: result.values.concept as TypedFact["concept"],
				certainty: result.certainty ?? "neutral",
				values: Object.fromEntries(
					Object.entries(result.values).filter(
						([key]) => key !== "concept" && key !== "certainty",
					),
				),
				workspaceId,
				branchId,
				provenance: {
					transactionId,
					sourceDocumentId:
						typeof result.provenance.sourceDocumentId === "string"
							? result.provenance.sourceDocumentId
							: undefined,
					sourceDocumentHead:
						typeof result.provenance.sourceDocumentHead === "string"
							? result.provenance.sourceDocumentHead
							: undefined,
					sourceRecordId:
						typeof result.provenance.recordId === "string"
							? result.provenance.recordId
							: undefined,
					syncRuleId:
						typeof result.provenance.ruleId === "string"
							? result.provenance.ruleId
							: undefined,
					sourcePath:
						typeof result.provenance.sourcePath === "string"
							? result.provenance.sourcePath
							: undefined,
				},
			};
			return { kind: "add_fact", workspaceId, branchId, fact };
		});
		await this.workspaceService.applyOperations(
			workspaceId,
			operations,
			workspace.version,
			workspace.eventHead,
			transactionId,
			transactionId,
		);
	}
}
