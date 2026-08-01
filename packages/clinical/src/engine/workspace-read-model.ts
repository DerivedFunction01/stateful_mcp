import type { EpistemicWorkspace } from "../schemas/epistemic";
import type { Cell } from "../session/cell";
import type {
	WorkspaceCellSummary,
	WorkspaceReadModel,
	WorkspaceSnapshot,
} from "../session/workspace-read-model";
import type { CellStore } from "../store/interfaces";
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

function projectCell(cell: Cell): WorkspaceCellSummary {
	return {
		cellId: cell.cellId,
		workspaceId:
			cell.collection.kind === "workspace" ? cell.collection.collectionId : "",
		sessionId: cell.sessionId,
		rawInput: cell.rawInput,
		status: cell.status,
		updatedAt: cell.updatedAt,
		routing: cell.routing,
		parsedOutput: cell.parsedOutput,
		workspaceCommands: cell.workspaceCommands,
		workspaceCommandWarnings: cell.workspaceCommandWarnings,
		errorMessage: cell.errorMessage,
		metadata: cell.metadata,
	};
}

export class WorkspaceReadModelImpl implements WorkspaceReadModel {
	constructor(
		private workspaceStore: WorkspaceStore,
		private cellStore?: CellStore,
	) {}

	async getWorkspace(
		sessionId: string,
		workspaceId: string,
	): Promise<WorkspaceSnapshot | null> {
		const workspace = await this.workspaceStore.get(sessionId, workspaceId);
		if (!workspace) return null;
		return this.project(workspace, sessionId);
	}

	async listWorkspaces(
		sessionId: string,
		soapNoteId: string,
	): Promise<WorkspaceSnapshot[]> {
		const workspaces = await this.workspaceStore.list(sessionId, soapNoteId);
		return await Promise.all(workspaces.map((w) => this.project(w, sessionId)));
	}

	private async project(
		workspace: EpistemicWorkspace,
		sessionId: string,
	): Promise<WorkspaceSnapshot> {
		let cells: WorkspaceCellSummary[] = [];
		if (this.cellStore) {
			const workspaceCells = await this.cellStore.listByCollection(sessionId, {
				kind: "workspace",
				collectionId: workspace.id,
			});
			cells = workspaceCells.map(projectCell);
		}

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
			cells,
			lifecycle: {
				closeRequested: workspace.closeRequested ?? false,
			},
		};
	}
}
