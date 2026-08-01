import type { ClinicalEngine } from "../engine/clinical-engine";
import type { WorkspaceStore } from "../engine/workspace-store";
import type { CellStore } from "../store/interfaces";
import type { Cell } from "./cell";
import type { CellProcessor, CellProcessResult } from "./cell-processor";

export interface WorkspaceCellOptions {
	branchId?: string;
	routingScope?: "global" | "branch_local" | "unresolved";
	mode?: "cdsl";
	parentCellId?: string;
}

export interface WorkspaceCellCreateResult {
	cell: Cell;
	cellId: string;
	workspaceId: string;
}

export interface WorkspaceCellListResult {
	cells: Cell[];
	workspaceId: string;
}

export class WorkspaceCellService {
	constructor(
		_engine: ClinicalEngine,
		private workspaceStore: WorkspaceStore,
		private cellProcessor: CellProcessor,
		private cellStore: CellStore,
	) {}

	async createCell(
		sessionId: string,
		workspaceId: string,
		rawInput: string,
		options: WorkspaceCellOptions = {},
	): Promise<WorkspaceCellCreateResult> {
		const workspace = await this.workspaceStore.get(sessionId, workspaceId);
		if (!workspace) {
			throw new Error(`Workspace ${workspaceId} not found`);
		}

		const routingScope =
			options.routingScope ?? this.inferRoutingScope(options);
		const branchId =
			options.branchId ??
			(routingScope === "branch_local" ? workspace.activeBranchId : undefined);

		if (routingScope === "branch_local" && !branchId) {
			throw new Error(
				"branch_local routing requires a branchId or an active branch",
			);
		}

		const cellId = `ws_cell_${workspaceId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const now = new Date().toISOString();

		const cell: Cell = {
			cellId,
			sessionId,
			mode: options.mode ?? "cdsl",
			rawInput,
			routing: {
				scope: routingScope,
				targetSchema: null,
				branchId,
				resolvedSection: null,
				resolvedSchema: null,
			},
			parsedOutput: null,
			workspaceId,
			status: "draft",
			updatedAt: now,
			context: {
				objects: {},
				sourceType: "manual_entry",
			},
			parentCellId: options.parentCellId,
		};

		await this.cellStore.save(cell);

		return { cell, cellId: cell.cellId, workspaceId };
	}

	async previewCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
	): Promise<CellProcessResult> {
		const cell = await this.getCell(sessionId, workspaceId, cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found`);
		}
		this.assertEditable(cell);
		const result = await this.cellProcessor.preview(cell);
		return result;
	}

	async resetCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
	): Promise<CellProcessResult> {
		const cell = await this.getCell(sessionId, workspaceId, cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found`);
		}
		this.assertEditable(cell);
		const result = this.cellProcessor.resetToDraft(cell);
		if (!result.error) {
			await this.cellStore.save(cell);
		}
		return result;
	}

	async editCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
		rawInput: string,
	): Promise<CellProcessResult> {
		const cell = await this.getCell(sessionId, workspaceId, cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found`);
		}
		this.assertEditable(cell);
		const result = this.cellProcessor.edit(cell, rawInput);
		if (!result.error) {
			await this.cellStore.save(cell);
		}
		return result;
	}

	async executeCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
		alias?: string,
	): Promise<CellProcessResult> {
		const cell = await this.getCell(sessionId, workspaceId, cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found`);
		}
		this.assertEditable(cell);
		const result = await this.cellProcessor.execute(cell, alias);
		return result;
	}

	async deleteCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
	): Promise<CellProcessResult> {
		const cell = await this.getCell(sessionId, workspaceId, cellId);
		if (!cell) {
			throw new Error(`Cell ${cellId} not found`);
		}
		if (cell.status === "committed") {
			return {
				cell,
				error: {
					code: "CELL_IS_LOCKED" as any,
					message: "cannot delete a committed workspace cell",
				},
			};
		}
		const result = this.cellProcessor.delete(cell);
		if (!result.error) {
			await this.cellStore.save(cell);
		}
		return result;
	}

	async listCells(sessionId: string, workspaceId: string): Promise<Cell[]> {
		const cells = await this.cellStore.list(sessionId);
		return cells.filter((c) => c.workspaceId === workspaceId);
	}

	async getCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
	): Promise<Cell | null> {
		const cell = await this.cellStore.get(cellId);
		if (!cell) return null;
		if (cell.workspaceId !== workspaceId) return null;
		return cell;
	}

	async supersedeCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
		rawInput: string,
	): Promise<WorkspaceCellCreateResult> {
		const original = await this.getCell(sessionId, workspaceId, cellId);
		if (!original) {
			throw new Error(`Cell ${cellId} not found`);
		}

		const newCellId = `ws_cell_${workspaceId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const now = new Date().toISOString();

		const newCell: Cell = {
			cellId: newCellId,
			sessionId,
			mode: original.mode,
			rawInput,
			routing: { ...original.routing },
			parsedOutput: null,
			workspaceId,
			status: "draft",
			updatedAt: now,
			context: {
				objects: {},
				sourceType: "manual_entry",
			},
			parentCellId: original.cellId,
			metadata: {
				supersedesCellId: original.cellId,
			},
		};

		await this.cellStore.save(newCell);

		return { cell: newCell, cellId: newCell.cellId, workspaceId };
	}

	async refreshCell(
		sessionId: string,
		workspaceId: string,
		cellId: string,
	): Promise<Cell | null> {
		return this.getCell(sessionId, workspaceId, cellId);
	}

	private inferRoutingScope(
		options: WorkspaceCellOptions,
	): "global" | "branch_local" | "unresolved" {
		if (options.routingScope) return options.routingScope;
		if (options.branchId) return "branch_local";
		return "unresolved";
	}

	private assertEditable(cell: Cell): void {
		if (cell.status === "locked") {
			throw new Error("cell is locked");
		}
		if (cell.status === "deleted") {
			throw new Error("cell is deleted");
		}
	}
}
