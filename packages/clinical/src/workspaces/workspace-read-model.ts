import type { CellStore } from "../cells/cell-service-types";
import type { StructuredCell } from "../cells/structured-cell";
import type { WorkspaceService } from "./workspace-service";
import type { WorkspaceSnapshot } from "./workspace-snapshot";

export interface WorkspaceReadModel {
	getWorkspace(workspaceId: string): Promise<WorkspaceSnapshot | null>;
	rebuildWorkspace(workspaceId: string): Promise<WorkspaceSnapshot | null>;
	getCellSummaries(
		workspaceId: string,
		sessionId: string,
	): Promise<WorkspaceCellSummary[]>;
}

export interface WorkspaceCellSummary {
	cellId: string;
	rawText: string;
	status: StructuredCell["lifecycle"]["status"];
	updatedAt: string;
	collection: StructuredCell["collection"];
	diagnostics: StructuredCell["diagnostics"];
	execution: StructuredCell["execution"];
	provenance: StructuredCell["provenance"];
}

export class WorkspaceReadModelImpl implements WorkspaceReadModel {
	constructor(
		private readonly service: WorkspaceService,
		private readonly cells?: CellStore,
	) {}

	getWorkspace(workspaceId: string): Promise<WorkspaceSnapshot | null> {
		return this.service.getSnapshot(workspaceId);
	}

	async rebuildWorkspace(
		workspaceId: string,
	): Promise<WorkspaceSnapshot | null> {
		await this.service.rebuildFromEvents(workspaceId);
		return this.service.getSnapshot(workspaceId);
	}

	async getCellSummaries(
		workspaceId: string,
		sessionId: string,
	): Promise<WorkspaceCellSummary[]> {
		if (!this.cells) return [];
		const cells = await this.cells.listByCollection(sessionId, {
			kind: "workspace",
			collectionId: workspaceId,
		});
		return cells.map((cell) => ({
			cellId: cell.cellId,
			rawText: cell.authored.rawText,
			status: cell.lifecycle.status,
			updatedAt: cell.source.updatedAt,
			collection: cell.collection,
			diagnostics: cell.diagnostics,
			execution: cell.execution,
			provenance: cell.provenance,
		}));
	}
}
