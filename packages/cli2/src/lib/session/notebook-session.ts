import type { StructuredCellService } from "@stateful-mcp/clinical/cells/structured-cell-service";
import type {
	CreateCellRequest,
	CellStore,
	CellPreview,
	CellExecutionResult,
} from "@stateful-mcp/clinical/cells/cell-service-types";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { getCommandBarSuggestions } from "@stateful-mcp/clinical/commands/command-autocomplete-provider";
import type { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import type {
	CommandAutocompleteContext,
	CommandSuggestion,
} from "@stateful-mcp/clinical/commands/command-bar-types";
import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import type {
	NotebookSessionRecord,
	NotebookSessionStore,
} from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";

export interface NotebookEditorSnapshot {
	record: NotebookSessionRecord;
	cells: StructuredCell[];
	activeCellId?: string;
}

export interface SaveNotebookEditorSnapshotInput {
	cellOrder: string[];
	activeCellId?: string;
	draftText?: string;
	editorMode?: EditorMode;
	commandHistory: string[];
	expectedRevision: number;
}

export interface NotebookSession {
	sessionId: string;
	engine: ClinicalEngine;
	commandBar: CommandBarService;
	cellService: StructuredCellService;
	cellStore: CellStore;
	variableCells: VariableCellService;
	syntaxProfile: CommandSyntaxProfile;
	sessionStore: NotebookSessionStore;
	loadEditorSnapshot(): Promise<NotebookEditorSnapshot>;
	saveEditorSnapshot(input: SaveNotebookEditorSnapshotInput): Promise<void>;
	listCells(): Promise<StructuredCell[]>;
	createCell(
		input: Omit<CreateCellRequest, "sessionId"> & { position?: number },
	): Promise<StructuredCell>;
	previewCell(cellId: string): Promise<CellPreview>;
	executeCell(cellId: string, preview: CellPreview): Promise<CellExecutionResult>;
	getAutocomplete(
		context: CommandAutocompleteContext,
	): Promise<CommandSuggestion[]>;
}

export function createNotebookSession(input: {
	sessionId: string;
	engine: ClinicalEngine;
	commandBar: CommandBarService;
	variableCells: VariableCellService;
	syntaxProfile: CommandSyntaxProfile;
	sessionStore: NotebookSessionStore;
}): NotebookSession {
	const runtime = input.engine.getRuntime();
	const listCells = () => input.engine.getCellService().list(input.sessionId);
	const loadEditorSnapshot = async (): Promise<NotebookEditorSnapshot> => {
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		const cells = reconcileNotebookCells(
			await listCells(),
			record.cellOrder,
		);
		return {
			record,
			cells,
			activeCellId: record.activeCellId,
		};
	};
	const saveEditorSnapshot = async (
		snapshot: SaveNotebookEditorSnapshotInput,
	): Promise<void> => {
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		await input.sessionStore.save(
			{
				...record,
				cellOrder: snapshot.cellOrder,
				activeCellId: snapshot.activeCellId,
				draftText: snapshot.draftText,
				editorMode: snapshot.editorMode,
				commandHistory: snapshot.commandHistory,
				updatedAt: new Date().toISOString(),
			},
			snapshot.expectedRevision,
		);
	};
	const createCell = async (
		request: Omit<CreateCellRequest, "sessionId"> & { position?: number },
	): Promise<StructuredCell> => {
		const cell = await input.engine.getCellService().create({
			...request,
			sessionId: input.sessionId,
		});
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		const nextOrder = [...record.cellOrder];
		const position = request.position;
		if (position === undefined || position < 0 || position > nextOrder.length)
			nextOrder.push(cell.cellId);
		else nextOrder.splice(position, 0, cell.cellId);
		await input.sessionStore.save(
			{
				...record,
				cellOrder: nextOrder,
				activeCellId: cell.cellId,
				updatedAt: new Date().toISOString(),
			},
			record.revision,
		);
		return cell;
	};
	const getCellContext = async (cellId: string) => {
		const record = await input.sessionStore.get(input.sessionId);
		const cell = await input.engine.getCell(cellId);
		if (!record) throw new Error(`Notebook session '${input.sessionId}' was not found`);
		if (!cell) throw new Error(`Cell '${cellId}' was not found`);
		return {
			cell,
			context: {
				sessionId: input.sessionId,
				workspaceId: record.workspaceId,
				documentId: record.documentId,
			},
		};
	};
	const previewCell = async (cellId: string): Promise<CellPreview> => {
		const { cell, context } = await getCellContext(cellId);
		return input.engine.getCellService().preview({
			cellId,
			expectedRevision: cell.lifecycle.revision,
			context,
		});
	};
	const executeCell = async (
		cellId: string,
		preview: CellPreview,
	): Promise<CellExecutionResult> => {
		const { cell, context } = await getCellContext(cellId);
		return input.engine.getCellService().execute({
			cellId,
			expectedRevision: cell.lifecycle.revision,
			previewId: preview.previewId,
			planFingerprint: preview.planFingerprint,
			idempotencyKey: `cell_${cellId}_${preview.planFingerprint}`,
			context,
		});
	};
	return {
		...input,
		cellService: input.engine.getCellService(),
		cellStore: runtime.stores.cellStore,
		loadEditorSnapshot,
		saveEditorSnapshot,
		listCells,
		createCell,
		previewCell,
		executeCell,
		getAutocomplete: (context) =>
			getCommandBarSuggestions(
				context,
				{
					macroStore: runtime.macros.defs,
					schemaRegistry: runtime.macros.schemaRegistry,
				},
				input.syntaxProfile,
			),
	};
}

export function reconcileNotebookCells(
	cells: readonly StructuredCell[],
	cellOrder: readonly string[],
): StructuredCell[] {
	const byId = new Map(cells.map((cell) => [cell.cellId, cell]));
	const seen = new Set<string>();
	const ordered: StructuredCell[] = [];
	for (const cellId of cellOrder) {
		const cell = byId.get(cellId);
		if (cell && !seen.has(cellId)) {
			ordered.push(cell);
			seen.add(cellId);
		}
	}
	for (const cell of cells) {
		if (!seen.has(cell.cellId)) {
			ordered.push(cell);
			seen.add(cell.cellId);
		}
	}
	return ordered;
}
