import type { ClinicalEngine } from "../engine/clinical-engine";
import type { WorkspaceStore } from "../engine/workspace-store";
import type { ParsedItem } from "../parser/schema-parsers";
import type { SoapNote } from "../schemas/document";
import type { CellStore } from "../store/interfaces";
import type { Cell } from "./cell";
import { CELL_ERROR_MESSAGES, CellError } from "./cell";

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
		private cellStore?: CellStore,
	) {}

	cellError(
		code: CellError,
		message?: string,
	): { code: CellError; message?: string } {
		return { code, message: message ?? CELL_ERROR_MESSAGES[code] };
	}

	async execute(cell: Cell, alias?: string): Promise<CellProcessResult> {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}

		// Handle narrative mode: directly write rawInput to the targeted SoapNote field
		if (cell.mode === "narrative") {
			if (!cell.narrativeTarget) {
				cell.status = "error";
				cell.errorMessage = CELL_ERROR_MESSAGES[CellError.NARRATIVE_TARGET_REQUIRED];
				await this.saveCell(cell);
				return { cell, error: this.cellError(CellError.NARRATIVE_TARGET_REQUIRED) };
			}
			cell.parsedOutput = null;
			cell.metadata = { ...cell.metadata, sourceType: "narrative" };
			try {
				const effectiveAlias = alias ?? cell.sessionId;
				const note = await this.engine.setSoapNoteField(
					cell.sessionId,
					cell.narrativeTarget,
					cell.rawInput,
					effectiveAlias,
				);
				cell.status = "committed";
				cell.lockedAt = new Date().toISOString();
				await this.saveCell(cell);
				return { cell, soapNote: note };
			} catch (err) {
				cell.status = "error";
				cell.errorMessage = err instanceof Error ? err.message : String(err);
				await this.saveCell(cell);
				return { cell, error: { code: CellError.PARSER_NOT_CONFIGURED, message: cell.errorMessage } };
			}
		}

		// Resolve parent context before processing
		const parentError = await this.resolveParentContext(cell);
		if (parentError) return parentError;

		// Save cell before processing for recoverability
		await this.saveCell(cell);

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

					// Post-processing: populate context and resolve link targets
					this.populateContext(cell);
					await this.resolveLinkTarget(cell);

					// Save cell after processing
					await this.saveCell(cell);

					return { cell, soapNote: note };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					await this.saveCell(cell);
					return {
						cell,
						error: {
							code: CellError.PARSER_NOT_CONFIGURED,
							message: cell.errorMessage,
						},
					};
				}
			}
			case "branch_local": {
				if (!cell.workspaceId || !cell.routing.branchId) {
					cell.status = "error";
					cell.errorMessage =
						CELL_ERROR_MESSAGES[CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID];
					await this.saveCell(cell);
					return {
						cell,
						error: this.cellError(CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID),
					};
				}
				if (!this.workspaceStore) {
					cell.status = "error";
					cell.errorMessage =
						CELL_ERROR_MESSAGES[CellError.WORKSPACE_STORE_NOT_CONFIGURED];
					await this.saveCell(cell);
					return {
						cell,
						error: this.cellError(CellError.WORKSPACE_STORE_NOT_CONFIGURED),
					};
				}
				cell.parsedOutput = null;
				cell.status = "parsing";
				try {
					const updatedWorkspace = await this.workspaceStore.process(
						cell.sessionId,
						cell.workspaceId,
						cell.routing.branchId,
						cell.rawInput,
					);
					cell.status = "committed";
					cell.lockedAt = new Date().toISOString();

					// Post-processing: populate context and resolve link targets
					this.populateContext(cell);
					await this.resolveLinkTarget(cell);

					// Save cell after processing
					await this.saveCell(cell);

					return { cell, workspaceId: updatedWorkspace.id };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					await this.saveCell(cell);
					return {
						cell,
						error: {
							code: CellError.PARSER_NOT_CONFIGURED,
							message: cell.errorMessage,
						},
					};
				}
			}
			case "unresolved": {
				cell.status = "error";
				cell.errorMessage = CELL_ERROR_MESSAGES[CellError.UNRESOLVED_ROUTING];
				await this.saveCell(cell);
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

		// Narrative cells have no preview — rawInput is written directly to the targeted field
		if (cell.mode === "narrative") {
			return { cell, error: { code: CellError.PARSER_NOT_CONFIGURED, message: "preview not available for narrative cells" } };
		}

		if (!this.parser) {
			return { cell, error: this.cellError(CellError.PARSER_NOT_CONFIGURED) };
		}

		// Resolve parent context before processing
		const parentError = await this.resolveParentContext(cell);
		if (parentError) return parentError;

		cell.parsedOutput = null;
		cell.status = "parsing";
		try {
			const parsed = await this.parser.parse(cell.rawInput);
			cell.parsedOutput = parsed;
			cell.status = "pending_commit";

			// Post-processing: populate context and resolve link targets
			this.populateContext(cell);
			await this.resolveLinkTarget(cell);

			return { cell, preview: parsed };
		} catch (err) {
			cell.status = "error";
			cell.errorMessage = err instanceof Error ? err.message : String(err);
			return {
				cell,
				error: {
					code: CellError.PARSER_NOT_CONFIGURED,
					message: cell.errorMessage,
				},
			};
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
			return {
				cell,
				error: this.cellError(CellError.CANNOT_LOCK_DELETED_CELL),
			};
		}
		cell.status = "locked";
		cell.lockedAt = new Date().toISOString();
		return { cell };
	}

	/**
	 * Populate cell.context.objects from parsedOutput after execution.
	 * Each parsed item is stored under its targetSchema group, keyed by cellId_item_{index}.
	 */
	private populateContext(cell: Cell): void {
		if (!cell.parsedOutput) return;
		for (let i = 0; i < cell.parsedOutput.length; i++) {
			const item = cell.parsedOutput[i]!;
			if (!cell.context.objects[item.targetSchema]) {
				cell.context.objects[item.targetSchema] = {};
			}
			const id = `${cell.cellId}_item_${i}`;
			cell.context.objects[item.targetSchema]![id] = item.extractedData;
		}
	}

	/**
	 * Resolve parentCellId by loading the parent cell from the store and
	 * copying its context into the current cell. If the parent is not found,
	 * the cell is set to error state.
	 */
	private async resolveParentContext(
		cell: Cell,
	): Promise<CellProcessResult | null> {
		if (!cell.parentCellId || !this.cellStore) return null;
		const parent = await this.cellStore.get(cell.parentCellId);
		if (!parent) {
			cell.status = "error";
			cell.errorMessage =
				CELL_ERROR_MESSAGES[CellError.PARENT_CELL_NOT_FOUND];
			return {
				cell,
				error: this.cellError(CellError.PARENT_CELL_NOT_FOUND),
			};
		}
		cell.context = structuredClone(parent.context);
		return null;
	}

	/**
	 * Resolve linkTarget by finding the target object in the parent cell's
	 * context and applying the merge strategy.
	 */
	private async resolveLinkTarget(cell: Cell): Promise<void> {
		if (!cell.linkTarget || !cell.parsedOutput || !this.cellStore) return;

		const { targetSchema, targetCellId, targetField, mergeStrategy } =
			cell.linkTarget;

		// Find the parent cell to get its context.objects
		const parent = await this.cellStore.get(targetCellId);
		if (!parent) return;

		// Find the target object in parent's context
		const targetContainer = parent.context.objects[targetSchema];
		if (!targetContainer) return;

		// Find the matching item — use the first item matching targetSchema
		const targetObj = Object.values(targetContainer)[0];
		if (!targetObj) return;

		// Navigate to targetField (dot-separated path)
		const fieldParts = targetField.split(".");
		let current: any = targetObj;
		for (let i = 0; i < fieldParts.length - 1; i++) {
			const part = fieldParts[i]!;
			current = current?.[part];
			if (!current) return;
		}
		const lastField = fieldParts[fieldParts.length - 1]!;

		// Apply mergeStrategy using the first parsed item's extractedData
		const newValue = cell.parsedOutput[0]?.extractedData;
		if (!newValue) return;

		switch (mergeStrategy) {
			case "replace":
				current[lastField] = newValue;
				break;
			case "append":
				if (!Array.isArray(current[lastField])) {
					current[lastField] = [];
				}
				(current[lastField] as unknown[]).push(newValue);
				break;
			case "deep_merge":
				current[lastField] = { ...(current[lastField] as Record<string, unknown>), ...newValue };
				break;
			case "partial_fill":
				current[lastField] = { ...newValue, ...(current[lastField] as Record<string, unknown>) };
				break;
		}

		// Save the parent cell with the updated context
		await this.cellStore.save(parent);
	}

	/**
	 * Save cell to the store if configured. Silently no-ops if no store.
	 */
	private async saveCell(cell: Cell): Promise<void> {
		if (!this.cellStore) return;
		await this.cellStore.save(cell);
	}
}