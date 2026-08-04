import type { CellPreview } from "@stateful-mcp/clinical/cells/cell-service-types";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	reduceNotebookEditor,
	type NotebookEditorAction,
	type NotebookEditorState,
	type NotebookRunMode,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { useCallback, useEffect, useReducer, useState } from "react";
import type { SessionState } from "./useSession";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";

export interface CellSuggestion {
	text: string;
	kind: string;
	detail?: string;
}

export interface UseNotebookReturn {
	state: NotebookEditorState;
	dispatch: (action: NotebookEditorAction) => void;
	insertBelow(): Promise<void>;
	insertAbove(): Promise<void>;
	createCell(rawInput?: string): Promise<StructuredCell | null>;
	runCell(cell: StructuredCell): Promise<void>;
	previewCell(cell: StructuredCell): Promise<void>;
	acceptPreview(preview: CellPreview): Promise<void>;
	setSessionMode(mode: NotebookRunMode): void;
	dispatchCommand(line: string): Promise<{
		success: boolean;
		message?: string;
		data?: unknown;
	}>;
	nextErrorIndex(): number | null;
	prevErrorIndex(): number | null;
	getAutocomplete(partial: string): AutocompleteSuggestion[];
	cellSuggestions: CellSuggestion[];
}

export type { NotebookEditorAction, NotebookEditorState };
export type { AutocompleteSuggestion };

export function useNotebook(session: SessionState | null): UseNotebookReturn {
	const [state, dispatch] = useReducer(
		reduceNotebookEditor,
		INITIAL__NOTEBOOK_EDITOR_STATE,
	);
	const [cellSuggestions] = useState<CellSuggestion[]>([]);

	const loadSnapshot = useCallback(async () => {
		if (!session) return;
		dispatch({ type: "set_loading", loading: true });
		try {
			const snapshot = await session.v2.notebook.loadEditorSnapshot();
			dispatch({ type: "set_cells", cells: snapshot.cells });
			const activeIndex = snapshot.activeCellId
				? snapshot.cells.findIndex(
					(cell) => cell.cellId === snapshot.activeCellId,
				)
				: -1;
			if (activeIndex >= 0) dispatch({ type: "set_active", index: activeIndex });
			dispatch({ type: "set_draft", text: snapshot.record.draftText ?? "" });
			dispatch({
				type: "set_command_history",
				history: snapshot.record.commandHistory,
			});
			if (snapshot.record.editorMode)
				dispatch({ type: "set_mode", mode: snapshot.record.editorMode });
			dispatch({ type: "mark_clean" });
			dispatch({ type: "set_message", message: undefined });
		} catch (error) {
			dispatch({
				type: "set_message",
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			dispatch({ type: "set_loading", loading: false });
		}
	}, [session]);

	useEffect(() => {
		void loadSnapshot();
	}, [loadSnapshot]);

	const saveEditorState = useCallback(async () => {
		if (!session) return;
		const snapshot = await session.v2.notebook.loadEditorSnapshot();
		await session.v2.notebook.saveEditorSnapshot({
			cellOrder: state.cells.map((cell) => cell.cellId),
			activeCellId: state.cells[state.activeIndex]?.cellId,
			draftText: state.draftText,
			editorMode: state.mode,
			commandHistory: state.commandHistory,
			expectedRevision: snapshot.record.revision,
		});
	}, [session, state]);

	const createCell = useCallback(
		async (rawInput = ""): Promise<StructuredCell | null> => {
			if (!session) return null;
			try {
				const cell = await session.v2.notebook.createCell({
					collection: {
						kind: "notebook",
						collectionId: session.sessionId,
					},
					rawText: rawInput,
				});
				dispatch({ type: "set_cells", cells: [...state.cells, cell] });
				dispatch({ type: "set_active", index: state.cells.length });
				return cell;
			} catch (error) {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
				return null;
			}
		},
		[session, state.cells],
	);

	const insertBelow = useCallback(async () => {
		if (!session) return;
		const cell = await session.v2.notebook.createCell({
			collection: { kind: "notebook", collectionId: session.sessionId },
			rawText: "",
			position: state.activeIndex + 1,
		});
		dispatch({ type: "set_cells", cells: [...state.cells.slice(0, state.activeIndex + 1), cell, ...state.cells.slice(state.activeIndex + 1)] });
		dispatch({ type: "set_active", index: state.activeIndex + 1 });
	}, [session, state.activeIndex, state.cells]);

	const insertAbove = useCallback(async () => {
		if (!session) return;
		const cell = await session.v2.notebook.createCell({
			collection: { kind: "notebook", collectionId: session.sessionId },
			rawText: "",
			position: state.activeIndex,
		});
		dispatch({ type: "set_cells", cells: [...state.cells.slice(0, state.activeIndex), cell, ...state.cells.slice(state.activeIndex)] });
		dispatch({ type: "set_active", index: state.activeIndex });
	}, [session, state.activeIndex, state.cells]);

	const runCell = useCallback(async (cell: StructuredCell) => {
		if (!session) return;
		try {
			const preview = await session.v2.notebook.previewCell(cell.cellId);
			if (preview.status !== "valid") {
				dispatch({ type: "set_preview", preview });
				dispatch({ type: "set_message", message: "Cell preview is invalid" });
				return;
			}
			const result = await session.v2.notebook.executeCell(cell.cellId, preview);
			const updated = await session.v2.engine.getCell(cell.cellId);
			if (updated) dispatch({ type: "replace_cell", cell: updated });
			dispatch({
				type: "set_message",
				message: result.status === "committed" ? "Cell committed" : result.diagnostics.join("; "),
			});
		} catch (error) {
			dispatch({
				type: "set_message",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}, [session]);

	const previewCell = useCallback(async (cell: StructuredCell) => {
		if (!session) return;
		try {
			const preview = await session.v2.notebook.previewCell(cell.cellId);
			dispatch({ type: "set_preview", preview });
			dispatch({
				type: "set_message",
				message: preview.status === "valid" ? "Cell preview ready" : "Cell preview is invalid",
			});
		} catch (error) {
			dispatch({
				type: "set_message",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}, [session]);

	const acceptPreview = useCallback(async (_preview: CellPreview) => {
		dispatch({ type: "set_preview", preview: undefined });
	}, []);

	const dispatchCommand = useCallback(
		async (line: string) => {
			if (!session)
				return { success: false, message: "CLI2 session is not ready" };
			const snapshot = await session.v2.notebook.loadEditorSnapshot();
			const result = await session.v2.commandBar.execute({
				rawText: line,
				sessionId: session.sessionId,
				workspaceId: snapshot.record.workspaceId,
				documentId: snapshot.record.documentId,
				cellId: snapshot.activeCellId,
			});
			const message =
				result.status === "committed"
					? "V2 command committed"
					: (result.error ?? "V2 command failed");
			dispatch({ type: "EXIT_COMMAND_MODE" });
			dispatch({ type: "set_message", message });
			return { success: result.status === "committed", message, data: result };
		},
		[session],
	);

	const getAutocomplete = useCallback(
		(partial: string): AutocompleteSuggestion[] => {
			if (!session) return [];
			const profile = session.v2.syntaxProfile;
			const token =
				state.mode === "MACRO"
					? profile.macroStartToken
					: profile.directCommandToken;
			const mappings =
				state.mode === "MACRO"
					? {}
					: {
							...profile.editorCommandMappings,
							...profile.directCommandMappings,
							[profile.variableCommandName]: "variable",
					  };
			return Object.keys(mappings)
				.filter((alias) => alias.startsWith(partial))
				.map((alias) => ({
					label: alias,
					value: `${token}${alias}`,
					type: "verb" as const,
					verb: alias,
					completionText: `${token}${alias}`,
					group: state.mode === "MACRO" ? "macro" : "v2",
					source: "editor" as const,
					hasArgs: false,
					kind: "verb" as const,
				}));
		},
		[session, state.mode],
	);

	const nextErrorIndex = useCallback((): number | null => {
		for (let index = state.activeIndex + 1; index < state.cells.length; index += 1)
			if (state.cells[index]?.lifecycle.status === "failed") return index;
		return null;
	}, [state.activeIndex, state.cells]);

	const prevErrorIndex = useCallback((): number | null => {
		for (let index = state.activeIndex - 1; index >= 0; index -= 1)
			if (state.cells[index]?.lifecycle.status === "failed") return index;
		return null;
	}, [state.activeIndex, state.cells]);

	return {
		state,
		dispatch,
		insertBelow,
		insertAbove,
		createCell,
		runCell,
		previewCell,
		acceptPreview,
		setSessionMode: (mode) => dispatch({ type: "set_run_mode", mode }),
		dispatchCommand,
		nextErrorIndex,
		prevErrorIndex,
		getAutocomplete,
		cellSuggestions,
	};
}
