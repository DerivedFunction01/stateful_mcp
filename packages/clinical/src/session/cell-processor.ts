import type { ClinicalEngine } from "../engine/clinical-engine";
import type { SoapNote } from "../schemas/document";
import type { WorkspaceStore } from "../engine/workspace-store";
import type { EpistemicWorkspace } from "../schemas/epistemic";
import type { ParsedItem } from "../parser/schema-parsers";
import { CellError, CELL_ERROR_MESSAGES } from "./cell";
import type { Cell } from "./cell";

export interface CellProcessResult {
	cell: Cell;
	soapNote?: SoapNote;
	workspaceId?: string;
	preview?: ParsedItem[];
	error?: { code: CellError; message?: string };
}

export class CellProcessor {
	constructor(
		private engine: ClinicalEngine,
		private workspaceStore?: WorkspaceStore,
		private parser?: { parse: (text: string) => Promise<ParsedItem[]> },
	) {}

	cellError(code: CellError, message?: string): { code: CellError; message?: string } {
		return { code, message: message ?? CELL_ERROR_MESSAGES[code] };
	}

	async execute(
		cell: Cell,
		alias?: string,
	): Promise<CellProcessResult> {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}

		const effectiveAlias = alias ?? cell.sessionId;

		switch (cell.routing.scope) {
			case "global": {
				cell.parsedOutput = null;
				cell.status = "parsing";
				try {
					const note = await this.engine.processCdsl(
						cell.sessionId,
						cell.rawInput,
						effectiveAlias,
					);
					cell.status = "committed";
					cell.lockedAt = new Date().toISOString();
					return { cell, soapNote: note };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					return { cell, error: { code: CellError.PARSER_NOT_CONFIGURED, message: cell.errorMessage } };
				}
			}
			case "branch_local": {
				if (!cell.workspaceId || !cell.routing.branchId) {
					cell.status = "error";
					cell.errorMessage = CELL_ERROR_MESSAGES[CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID];
					return { cell, error: this.cellError(CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID) };
				}
				if (!this.workspaceStore) {
					cell.status = "error";
					cell.errorMessage = CELL_ERROR_MESSAGES[CellError.WORKSPACE_STORE_NOT_CONFIGURED];
					return { cell, error: this.cellError(CellError.WORKSPACE_STORE_NOT_CONFIGURED) };
				}
				cell.parsedOutput = null;
				cell.status = "parsing";
				try {
					const updatedWorkspace =
						await this.workspaceStore.process(
							cell.sessionId,
							cell.workspaceId,
							cell.routing.branchId,
							cell.rawInput,
						);
					cell.status = "committed";
					cell.lockedAt = new Date().toISOString();
					return { cell, workspaceId: updatedWorkspace.id };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					return { cell, error: { code: CellError.PARSER_NOT_CONFIGURED, message: cell.errorMessage } };
				}
			}
			case "unresolved": {
				cell.status = "error";
				cell.errorMessage = CELL_ERROR_MESSAGES[CellError.UNRESOLVED_ROUTING];
				return { cell, error: this.cellError(CellError.UNRESOLVED_ROUTING) };
			}
		}
	}

	async preview(cell: Cell): Promise<CellProcessResult> {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}

		if (!this.parser) {
			return { cell, error: this.cellError(CellError.PARSER_NOT_CONFIGURED) };
		}

		cell.parsedOutput = null;
		cell.status = "parsing";
		try {
			const parsed = await this.parser.parse(cell.rawInput);
			cell.parsedOutput = parsed;
			cell.status = "pending_commit";
			return { cell, preview: parsed };
		} catch (err) {
			cell.status = "error";
			cell.errorMessage = err instanceof Error ? err.message : String(err);
			return { cell, error: { code: CellError.PARSER_NOT_CONFIGURED, message: cell.errorMessage } };
		}
	}

	delete(cell: Cell): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		cell.status = "deleted";
		cell.parsedOutput = null;
		return { cell };
	}

	lock(cell: Cell): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_ALREADY_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CANNOT_LOCK_DELETED_CELL) };
		}
		cell.status = "locked";
		cell.lockedAt = new Date().toISOString();
		return { cell };
	}
}
