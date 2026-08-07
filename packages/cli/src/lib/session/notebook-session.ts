import type {
	CellExecutionResult,
	CellLoadDiagnostic,
	CellPreview,
	CellStore,
	CreateCellRequest,
	EditCellRequest,
} from "@stateful-mcp/clinical/cells/cell-service-types";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { StructuredCellService } from "@stateful-mcp/clinical/cells/structured-cell-service";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { getCommandBarSuggestions } from "@stateful-mcp/clinical/commands/command-autocomplete-provider";
import type { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import type {
	CommandAutocompleteContext,
	CommandSuggestion,
} from "@stateful-mcp/clinical/commands/command-bar-types";
import type { CommandSyntaxProfile } from "@stateful-mcp/clinical/commands/command-syntax-profile";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import { MacroAuthoringSession } from "@stateful-mcp/clinical/macros/macro-authoring-session";
import type { SyntaxProfile } from "@stateful-mcp/clinical/macros/macro-profile";
import type {
	NotebookSessionRecord,
	NotebookSessionStore,
	NotebookUiState,
} from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";

export interface NotebookEditorSnapshot {
	record: NotebookSessionRecord;
	cells: StructuredCell[];
	activeCellId?: string;
	diagnostics: CellLoadDiagnostic[];
}

export interface SaveNotebookEditorSnapshotInput {
	cellOrder: string[];
	activeCellId?: string;
	draftText?: string;
	editorMode?: EditorMode;
	commandHistory: string[];
	expectedRevision: number;
}

export interface SaveNotebookUiStateInput {
	uiState: NotebookUiState;
	expectedRevision: number;
}

export interface ExecuteMacroInvocationInput {
	macroId: string;
	text: string;
	position?: number;
}

export interface PasteCellInput {
	sourceCellId?: string;
	rawText: string;
	sessionId: string;
	collection: StructuredCell["collection"];
	insertIndex?: number;
	provenanceOrigin?: "yank" | "paste";
}

export interface PasteCellsInput {
	sourceCellIds?: string[];
	rawTexts: string[];
	sessionId: string;
	collection: StructuredCell["collection"];
	insertIndex?: number;
	provenanceOrigin?: "yank" | "paste";
}

export interface DeleteCellResult {
	cellId: string;
	success: boolean;
	reason?: string;
}

export interface DeleteCellsResult {
	results: DeleteCellResult[];
	skipped: { cellId: string; reason: string }[];
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
	saveUiState(input: SaveNotebookUiStateInput): Promise<void>;
	executeMacroInvocation(input: ExecuteMacroInvocationInput): Promise<void>;
	listCells(): Promise<StructuredCell[]>;
	createCell(
		input: Omit<CreateCellRequest, "sessionId"> & { position?: number },
	): Promise<StructuredCell>;
	createPastedCell(input: PasteCellInput): Promise<StructuredCell>;
	createPastedCells(input: PasteCellsInput): Promise<StructuredCell[]>;
	removeCell(cellId: string): Promise<DeleteCellResult>;
	removeCells(cellIds: string[]): Promise<DeleteCellsResult>;
	restoreCell(cellId: string): Promise<StructuredCell>;
	previewCell(cellId: string): Promise<CellPreview>;
	executeCell(
		cellId: string,
		preview: CellPreview,
	): Promise<CellExecutionResult>;
	executeFinalizedMacro(
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult>;
	reverseFinalizedMacro(
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult>;
	editCell(request: EditCellRequest): Promise<StructuredCell>;
	supersedeCell(
		cellId: string,
		newRawText: string,
		expectedRevision: number,
	): Promise<StructuredCell>;
	cancelCell(cellId: string, expectedRevision: number): Promise<StructuredCell>;
	moveCells(cellIds: string[], targetIndex: number): Promise<void>;
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
	let sessionWriteQueue: Promise<void> = Promise.resolve();
	const enqueueSessionWrite = (write: () => Promise<void>): Promise<void> => {
		const operation = sessionWriteQueue.then(write, write);
		sessionWriteQueue = operation.catch(() => undefined);
		return operation;
	};
	const listCells = () => input.engine.getCellService().list(input.sessionId);
	const loadEditorSnapshot = async (): Promise<NotebookEditorSnapshot> => {
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		const { cells, diagnostics } = reconcileNotebookCells(
			await listCells(),
			record.cellOrder,
		);
		const cellIds = new Set(cells.map((cell) => cell.cellId));
		const activeCellId =
			record.activeCellId && cellIds.has(record.activeCellId)
				? record.activeCellId
				: (record.cellOrder[0] ?? cells[0]?.cellId);
		return {
			record,
			cells,
			activeCellId,
			diagnostics,
		};
	};
	const saveEditorSnapshot = async (
		snapshot: SaveNotebookEditorSnapshotInput,
	): Promise<void> => {
		await enqueueSessionWrite(async () => {
			const record = await input.sessionStore.get(input.sessionId);
			if (!record)
				throw new Error(`Notebook session '${input.sessionId}' was not found`);
			const expectedRevision =
				record.revision === snapshot.expectedRevision
					? snapshot.expectedRevision
					: record.revision;
			await input.sessionStore.save(
				{
					...record,
					cellOrder: snapshot.cellOrder,
					activeCellId: snapshot.activeCellId,
					draftText: snapshot.draftText,
					editorMode: snapshot.editorMode,
					commandHistory: snapshot.commandHistory,
					revision: record.revision + 1,
					updatedAt: new Date().toISOString(),
				},
				expectedRevision,
			);
		});
	};
	const saveUiState = async ({
		uiState,
		expectedRevision,
	}: SaveNotebookUiStateInput): Promise<void> => {
		await enqueueSessionWrite(async () => {
			const record = await input.sessionStore.get(input.sessionId);
			if (!record)
				throw new Error(`Notebook session '${input.sessionId}' was not found`);
			const revision =
				record.revision === expectedRevision
					? expectedRevision
					: record.revision;
			await input.sessionStore.save(
				{
					...record,
					uiState,
					revision: record.revision + 1,
					updatedAt: new Date().toISOString(),
				},
				revision,
			);
		});
	};
	const executeMacroInvocation = async ({
		macroId,
		text,
		position,
	}: ExecuteMacroInvocationInput): Promise<void> => {
		const definitions = await runtime.macros.defs.list();
		const definition = definitions.find(
			(candidate) => candidate.macroId === macroId,
		);
		if (!definition) throw new Error(`Macro '${macroId}' is not available`);
		const rawText =
			`${input.syntaxProfile.macroStartToken}${definition.macroName} ${text}`.trim();
		const authoring = runtime.macros.authoring;
		const inspection = await authoring.inspectDraft(rawText, [], undefined);
		if (!inspection)
			throw new Error(`Macro '${macroId}' could not be inspected`);
		const preview = await authoring.compileDraft(rawText, {
			profileId: input.syntaxProfile.profileId,
			sessionId: input.sessionId,
		});
		const authoringSession = new MacroAuthoringSession({
			profile: input.syntaxProfile as unknown as SyntaxProfile,
			initialText: rawText,
		});
		authoringSession.dispatch({
			type: "inspection_resolved",
			definition: inspection.definition,
			childDefinitions: inspection.childDefinitions,
			slots: inspection.slots,
		});
		authoringSession.setExecutablePreview(preview);
		const finalized = authoringSession.finalize();
		if (!finalized.ok)
			throw new Error(
				finalized.diagnostics.map((item) => item.message).join("; "),
			);
		const cell = await createCell({
			collection: { kind: "notebook", collectionId: input.sessionId },
			rawText: finalized.authoredText,
			finalizedMacro: finalized,
			position,
		});
		const result = await executeFinalizedMacro(
			cell.cellId,
			`macro_${cell.cellId}_${finalized.fingerprint}`,
		);
		if (result.status !== "committed")
			throw new Error(result.diagnostics.join("; "));
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
	const createPastedCell = async (
		request: PasteCellInput,
	): Promise<StructuredCell> => {
		const cell = await input.engine.getCellService().create({
			sessionId: request.sessionId,
			collection: request.collection,
			rawText: request.rawText,
		});
		const now = new Date().toISOString();
		const updated: StructuredCell = {
			...cell,
			provenance: {
				...cell.provenance,
				parentCellId: request.sourceCellId,
			},
			lifecycle: {
				...cell.lifecycle,
				status: "draft",
			},
			source: {
				...cell.source,
				origin:
					request.provenanceOrigin === "yank" ? "imported" : cell.source.origin,
			},
		};
		await runtime.stores.cellStore.save(updated);
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		const nextOrder = [...record.cellOrder];
		const position = request.insertIndex;
		if (position === undefined || position < 0 || position > nextOrder.length)
			nextOrder.push(cell.cellId);
		else nextOrder.splice(position, 0, cell.cellId);
		await input.sessionStore.save(
			{
				...record,
				cellOrder: nextOrder,
				activeCellId: cell.cellId,
				updatedAt: now,
			},
			record.revision,
		);
		return updated;
	};
	const createPastedCells = async (
		request: PasteCellsInput,
	): Promise<StructuredCell[]> => {
		const results: StructuredCell[] = [];
		for (let i = 0; i < request.rawTexts.length; i++) {
			const cell = await createPastedCell({
				sourceCellId: request.sourceCellIds?.[i],
				rawText: request.rawTexts[i] ?? "",
				sessionId: request.sessionId,
				collection: request.collection,
				insertIndex:
					request.insertIndex !== undefined
						? request.insertIndex + i
						: undefined,
				provenanceOrigin: request.provenanceOrigin,
			});
			results.push(cell);
		}
		return results;
	};
	const removeCell = async (cellId: string): Promise<DeleteCellResult> => {
		const cell = await input.engine.getCellService().get(cellId);
		if (!cell) return { cellId, success: false, reason: "not found" };
		const eligibility = input.engine.getCellService().canDelete(cell);
		if (!eligibility.eligible) {
			return { cellId, success: false, reason: eligibility.reason };
		}
		try {
			await input.engine
				.getCellService()
				.markDeleted({ cellId, expectedRevision: cell.lifecycle.revision });
			const record = await input.sessionStore.get(input.sessionId);
			if (!record)
				throw new Error(`Notebook session '${input.sessionId}' was not found`);
			const nextOrder = record.cellOrder.filter((id) => id !== cellId);
			await input.sessionStore.save(
				{
					...record,
					cellOrder: nextOrder,
					updatedAt: new Date().toISOString(),
				},
				record.revision,
			);
			return { cellId, success: true };
		} catch (error) {
			return {
				cellId,
				success: false,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	};
	const removeCells = async (cellIds: string[]): Promise<DeleteCellsResult> => {
		const results: DeleteCellResult[] = [];
		const skipped: { cellId: string; reason: string }[] = [];
		for (const cellId of cellIds) {
			const result = await removeCell(cellId);
			if (result.success) results.push(result);
			else if (result.reason) skipped.push({ cellId, reason: result.reason });
		}
		return { results, skipped };
	};
	const restoreCell = async (cellId: string): Promise<StructuredCell> => {
		const cell = await input.engine.getCellService().get(cellId);
		if (!cell) throw new Error(`Cell '${cellId}' not found`);
		return input.engine.getCellService().restoreDraftCell({
			cellId,
			expectedRevision: cell.lifecycle.revision,
		});
	};
	const getCellContext = async (cellId: string) => {
		const record = await input.sessionStore.get(input.sessionId);
		const cell = await input.engine.getCell(cellId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
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
	const executeFinalizedMacro = async (
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult> =>
		input.engine.getCellService().executeFinalizedMacro(cellId, idempotencyKey);
	const reverseFinalizedMacro = async (
		cellId: string,
		idempotencyKey: string,
	): Promise<CellExecutionResult> =>
		input.engine.getCellService().reverseFinalizedMacro(cellId, idempotencyKey);
	const editCell = async (
		request: EditCellRequest,
	): Promise<StructuredCell> => {
		return input.engine.getCellService().edit(request);
	};
	const supersedeCell = async (
		cellId: string,
		newRawText: string,
		expectedRevision: number,
	): Promise<StructuredCell> => {
		return input.engine.getCellService().supersede({
			cellId,
			newRawText,
			expectedRevision,
		});
	};
	const cancelCell = async (
		cellId: string,
		expectedRevision: number,
	): Promise<StructuredCell> => {
		return input.engine.getCellService().cancel({
			cellId,
			expectedRevision,
		});
	};
	const moveCells = async (
		cellIds: string[],
		targetIndex: number,
	): Promise<void> => {
		const record = await input.sessionStore.get(input.sessionId);
		if (!record)
			throw new Error(`Notebook session '${input.sessionId}' was not found`);
		const nextOrder = [...record.cellOrder];
		for (const cellId of cellIds) {
			const fromIndex = nextOrder.indexOf(cellId);
			if (fromIndex < 0) continue;
			nextOrder.splice(fromIndex, 1);
		}
		const insertAt = Math.max(0, Math.min(targetIndex, nextOrder.length));
		nextOrder.splice(insertAt, 0, ...cellIds);
		await input.sessionStore.save(
			{
				...record,
				cellOrder: nextOrder,
				updatedAt: new Date().toISOString(),
			},
			record.revision,
		);
	};
	return {
		...input,
		cellService: input.engine.getCellService(),
		cellStore: runtime.stores.cellStore,
		loadEditorSnapshot,
		saveEditorSnapshot,
		saveUiState,
		executeMacroInvocation,
		listCells,
		createCell,
		createPastedCell,
		createPastedCells,
		removeCell,
		removeCells,
		restoreCell,
		previewCell,
		executeCell,
		executeFinalizedMacro,
		reverseFinalizedMacro,
		editCell,
		supersedeCell,
		cancelCell,
		moveCells,
		getAutocomplete: (context) =>
			getCommandBarSuggestions(
				context,
				{
					macroStore: runtime.macros.defs,
					schemaRegistry: runtime.macros.schemaRegistry,
					dictionary: runtime.macros.dictionary,
					learningService: runtime.learning?.macro,
				},
				input.syntaxProfile,
			),
	};
}

export function reconcileNotebookCells(
	cells: readonly StructuredCell[],
	cellOrder: readonly string[],
): { cells: StructuredCell[]; diagnostics: CellLoadDiagnostic[] } {
	const byId = new Map(cells.map((cell) => [cell.cellId, cell]));
	const seen = new Set<string>();
	const ordered: StructuredCell[] = [];
	const diagnostics: CellLoadDiagnostic[] = [];
	for (const cellId of cellOrder) {
		const cell = byId.get(cellId);
		if (cell && !seen.has(cellId)) {
			ordered.push(cell);
			seen.add(cellId);
		} else if (!seen.has(cellId)) {
			diagnostics.push({
				kind: "invalid_record",
				cellId,
				reason: "stale cellOrder entry not found in cell store",
			});
		}
	}
	for (const cell of cells) {
		if (!seen.has(cell.cellId)) {
			ordered.push(cell);
			seen.add(cell.cellId);
		}
	}
	return { cells: ordered, diagnostics };
}
