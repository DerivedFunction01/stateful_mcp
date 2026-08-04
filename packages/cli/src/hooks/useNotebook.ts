import type { CellPreview } from "@stateful-mcp/clinical/cells/cell-service-types";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	type NotebookEditorAction,
	type NotebookEditorState,
	type NotebookRunMode,
	reduceNotebookEditor,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { useCallback, useEffect, useReducer, useState } from "react";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import { dedupeCanonicalSuggestions } from "../lib/editor/command-autocomplete";
import { buildCommandDescriptors } from "../lib/editor/command-descriptors";
import type { SessionState } from "./useSession";

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
	deleteActive(): Promise<void>;
	yankActive(): Promise<void>;
	pasteActive(): Promise<void>;
	pasteAbove(): Promise<void>;
	deleteSelection(): Promise<void>;
	yankSelection(): Promise<void>;
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

export type {
	AutocompleteSuggestion,
	NotebookEditorAction,
	NotebookEditorState,
};

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
			if (activeIndex >= 0)
				dispatch({ type: "set_active", index: activeIndex });
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
		dispatch({
			type: "set_cells",
			cells: [
				...state.cells.slice(0, state.activeIndex + 1),
				cell,
				...state.cells.slice(state.activeIndex + 1),
			],
		});
		dispatch({ type: "set_active", index: state.activeIndex + 1 });
	}, [session, state.activeIndex, state.cells]);

	const insertAbove = useCallback(async () => {
		if (!session) return;
		const cell = await session.v2.notebook.createCell({
			collection: { kind: "notebook", collectionId: session.sessionId },
			rawText: "",
			position: state.activeIndex,
		});
		dispatch({
			type: "set_cells",
			cells: [
				...state.cells.slice(0, state.activeIndex),
				cell,
				...state.cells.slice(state.activeIndex),
			],
		});
		dispatch({ type: "set_active", index: state.activeIndex });
	}, [session, state.activeIndex, state.cells]);

	const runCell = useCallback(
		async (cell: StructuredCell) => {
			if (!session) return;
			try {
				const preview = await session.v2.notebook.previewCell(cell.cellId);
				if (preview.status !== "valid") {
					dispatch({ type: "set_preview", preview });
					dispatch({ type: "set_message", message: "Cell preview is invalid" });
					return;
				}
				const result = await session.v2.notebook.executeCell(
					cell.cellId,
					preview,
				);
				const updated = await session.v2.engine.getCell(cell.cellId);
				if (updated) dispatch({ type: "replace_cell", cell: updated });
				dispatch({
					type: "set_message",
					message:
						result.status === "committed"
							? "Cell committed"
							: result.diagnostics.join("; "),
				});
			} catch (error) {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		},
		[session],
	);

	const previewCell = useCallback(
		async (cell: StructuredCell) => {
			if (!session) return;
			try {
				const preview = await session.v2.notebook.previewCell(cell.cellId);
				dispatch({ type: "set_preview", preview });
				dispatch({
					type: "set_message",
					message:
						preview.status === "valid"
							? "Cell preview ready"
							: "Cell preview is invalid",
				});
			} catch (error) {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		},
		[session],
	);

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
			dispatch({ type: "set_mode", mode: "NORMAL" });
			dispatch({ type: "set_command", text: "" });
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
			// Build canonical CommandDescriptors from the active syntax profile.
			// In MACRO mode, only macro names are suggested (V1 parity).
			const descriptors = buildCommandDescriptors(profile, {
				variableName:
					state.mode === "MACRO" ? undefined : profile.variableCommandName,
				variableAliases: state.mode === "MACRO" ? undefined : ["variable"],
			});
			return dedupeCanonicalSuggestions(
				descriptors,
				partial,
				token,
				state.mode === "MACRO" ? "macro" : "editor",
				state.mode === "MACRO" ? "macro" : "v2",
			);
		},
		[session, state.mode],
	);

	const nextErrorIndex = useCallback((): number | null => {
		for (
			let index = state.activeIndex + 1;
			index < state.cells.length;
			index += 1
		)
			if (state.cells[index]?.lifecycle.status === "failed") return index;
		return null;
	}, [state.activeIndex, state.cells]);

	const prevErrorIndex = useCallback((): number | null => {
		for (let index = state.activeIndex - 1; index >= 0; index -= 1)
			if (state.cells[index]?.lifecycle.status === "failed") return index;
		return null;
	}, [state.activeIndex, state.cells]);

	const deleteActive = useCallback(async () => {
		if (!session) return;
		const cell = state.cells[state.activeIndex];
		if (!cell) return;
		const result = await session.v2.notebook.removeCell(cell.cellId);
		if (result.success) {
			dispatch({ type: "remove_cells", cellIds: [cell.cellId] });
		} else {
			dispatch({
				type: "set_message",
				message: result.reason
					? `Cannot delete: ${result.reason}`
					: "Delete failed",
			});
		}
	}, [session, state.activeIndex, state.cells]);

	const yankActive = useCallback(async () => {
		if (!session) return;
		const cell = state.cells[state.activeIndex];
		if (!cell) return;
		dispatch({
			type: "yank_cells",
			cellIds: [cell.cellId],
			snapshots: [cell],
		});
	}, [session, state.activeIndex, state.cells]);

	const pasteActive = useCallback(async () => {
		if (!session) return;
		if (!state.yankBuffer || state.yankBuffer.snapshots.length === 0) {
			dispatch({ type: "set_message", message: "Yank buffer is empty" });
			return;
		}
		const rawTexts = state.yankBuffer.snapshots.map((s) => s.authored.rawText);
		const cells = await session.v2.notebook.createPastedCells({
			sourceCellIds: state.yankBuffer.sourceCellIds,
			rawTexts,
			sessionId: session.sessionId,
			collection: {
				kind: "notebook",
				collectionId: session.sessionId,
			},
			insertIndex: state.activeIndex,
			provenanceOrigin: "yank",
		});
		dispatch({
			type: "paste_cells",
			cells,
			insertIndex: state.activeIndex,
		});
	}, [session, state.activeIndex, state.yankBuffer]);

	const pasteAbove = useCallback(async () => {
		if (!session) return;
		if (!state.yankBuffer || state.yankBuffer.snapshots.length === 0) {
			dispatch({ type: "set_message", message: "Yank buffer is empty" });
			return;
		}
		const rawTexts = state.yankBuffer.snapshots.map((s) => s.authored.rawText);
		const cells = await session.v2.notebook.createPastedCells({
			sourceCellIds: state.yankBuffer.sourceCellIds,
			rawTexts,
			sessionId: session.sessionId,
			collection: {
				kind: "notebook",
				collectionId: session.sessionId,
			},
			insertIndex: state.activeIndex,
			provenanceOrigin: "yank",
		});
		dispatch({
			type: "paste_cells",
			cells,
			insertIndex: state.activeIndex,
		});
	}, [session, state.activeIndex, state.yankBuffer]);

	const deleteSelection = useCallback(async () => {
		if (!session) return;
		const lo = Math.min(state.visualStart, state.visualEnd);
		const hi = Math.max(state.visualStart, state.visualEnd);
		const selected = state.cells.slice(lo, hi + 1);
		if (selected.length === 0) return;
		const cellIds = selected.map((c) => c.cellId);
		const result = await session.v2.notebook.removeCells(cellIds);
		const successful = result.results
			.filter((r) => r.success)
			.map((r) => r.cellId);
		if (successful.length > 0) {
			dispatch({ type: "remove_cells", cellIds: successful });
		}
		if (result.skipped.length > 0) {
			const reasons = result.skipped
				.map((s) => `${s.cellId}: ${s.reason}`)
				.join("; ");
			dispatch({
				type: "set_message",
				message: `Skipped protected cells: ${reasons}`,
			});
		}
	}, [session, state.visualStart, state.visualEnd, state.cells]);

	const yankSelection = useCallback(async () => {
		if (!session) return;
		const lo = Math.min(state.visualStart, state.visualEnd);
		const hi = Math.max(state.visualStart, state.visualEnd);
		const selected = state.cells.slice(lo, hi + 1);
		if (selected.length === 0) return;
		dispatch({
			type: "yank_cells",
			cellIds: selected.map((c) => c.cellId),
			snapshots: selected,
		});
	}, [session, state.visualStart, state.visualEnd, state.cells]);

	return {
		state,
		dispatch,
		insertBelow,
		insertAbove,
		createCell,
		runCell,
		previewCell,
		acceptPreview,
		deleteActive,
		yankActive,
		pasteActive,
		pasteAbove,
		deleteSelection,
		yankSelection,
		setSessionMode: (mode) => dispatch({ type: "set_run_mode", mode }),
		dispatchCommand,
		nextErrorIndex,
		prevErrorIndex,
		getAutocomplete,
		cellSuggestions,
	};
}
