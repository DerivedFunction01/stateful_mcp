import type { StructuredCellService } from "@stateful-mcp/clinical/cells/structured-cell-service";
import type {
	CreateCellRequest,
	CellStore,
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
	createCell(input: Omit<CreateCellRequest, "sessionId">): Promise<StructuredCell>;
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
		request: Omit<CreateCellRequest, "sessionId">,
	): Promise<StructuredCell> => {
		const cell = await input.engine.getCellService().create({
			...request,
			sessionId: input.sessionId,
		});
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		await input.sessionStore.save(
			{
				...record,
				cellOrder: [...record.cellOrder, cell.cellId],
				activeCellId: cell.cellId,
				updatedAt: new Date().toISOString(),
			},
			record.revision,
		);
		return cell;
	};
	return {
		...input,
		cellService: input.engine.getCellService(),
		cellStore: runtime.stores.cellStore,
		loadEditorSnapshot,
		saveEditorSnapshot,
		listCells,
		createCell,
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
