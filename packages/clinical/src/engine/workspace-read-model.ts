import type { EpistemicWorkspace } from "../schemas/epistemic";
import type {
	WorkspaceReadModel,
	WorkspaceSnapshot,
} from "../session/workspace-read-model";
import type { WorkspaceStore } from "./workspace-store";

function mapStatus(
	status: "active" | "suspended" | "confirmed" | "ruled_out" | "abandoned",
): "active" | "suspended" | "confirmed" | "rule_out" | "closed" {
	switch (status) {
		case "ruled_out":
			return "rule_out";
		case "abandoned":
			return "closed";
		default:
			return status;
	}
}

export class WorkspaceReadModelImpl implements WorkspaceReadModel {
	constructor(private workspaceStore: WorkspaceStore) {}

	async getWorkspace(
		sessionId: string,
		workspaceId: string,
	): Promise<WorkspaceSnapshot | null> {
		const workspace = await this.workspaceStore.get(sessionId, workspaceId);
		if (!workspace) return null;
		return this.project(workspace);
	}

	async listWorkspaces(
		sessionId: string,
		soapNoteId: string,
	): Promise<WorkspaceSnapshot[]> {
		const workspaces = await this.workspaceStore.list(sessionId, soapNoteId);
		return workspaces.map((w) => this.project(w));
	}

	private project(workspace: EpistemicWorkspace): WorkspaceSnapshot {
		return {
			workspaceId: workspace.id,
			sourceSoapNoteId: workspace.sourceSoapNoteId,
			activeBranchId: workspace.activeBranchId,
			branches: workspace.branches.map((b) => ({
				branchId: b.id,
				name: b.name,
				status: mapStatus(b.status),
				hypothesisConcept: b.hypothesisConcept,
				supporting: b.supportingConcepts.map((c) => c.display ?? "?"),
				refuting: b.refutingConcepts.map((c) => c.display ?? "?"),
				supportingCount: b.supportingConcepts.length,
				refutingCount: b.refutingConcepts.length,
				commandAlias: b.commandAlias,
			})),
			globalFacts: workspace.globalFacts.map((f) => ({
				targetSchema: (f as any).targetSchema ?? "unknown",
				rawText: (f as any).rawText ?? undefined,
				extractedData: (f as any).extractedData ?? undefined,
			})),
			globalFactCount: workspace.globalFacts.length,
		};
	}
}
