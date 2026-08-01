import {
	notebookReducer,
	INITIAL_NOTEBOOK_STATE,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { CommandDispatcher } from "@stateful-mcp/clinical/notebook/command-dispatcher";
import { PreviewWorkflow } from "@stateful-mcp/clinical/notebook/preview-workflow";
import { getAutocompleteSuggestions } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { ExecutionPolicy } from "@stateful-mcp/clinical/notebook/notebook-state";
import { useCallback, useRef, useReducer } from "react";
import type { SessionState } from "./useSession";

export type { ExecutionPolicy, NotebookState, NotebookAction } from "@stateful-mcp/clinical/notebook/notebook-state";
export type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";

export function useNotebook(session: SessionState | null) {
	const [state, dispatch] = useReducer(notebookReducer, INITIAL_NOTEBOOK_STATE);
	const editorRegistryRef = useRef(EditorCommandRegistry.createDefault());

	const createCell = useCallback(
		(sessionId: string, rawInput = ""): Cell => ({
			cellId: `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			sessionId,
			mode: "cdsl",
			rawInput,
			routing: { scope: "unresolved", targetSchema: null },
			parsedOutput: null,
			status: "draft",
			updatedAt: new Date().toISOString(),
			context: { objects: {} },
		}),
		[],
	);

	const insertBelow = useCallback(
		(sessionId: string) => {
			const cell = createCell(sessionId);
			dispatch({ type: "INSERT_CELL", cell, position: state.activeIndex + 1 });
		},
		[state.activeIndex, createCell],
	);

	const insertAbove = useCallback(
		(sessionId: string) => {
			const cell = createCell(sessionId);
			dispatch({ type: "INSERT_CELL", cell, position: state.activeIndex });
		},
		[state.activeIndex, createCell],
	);

	const runCell = useCallback(
		async (cell: Cell) => {
			if (!session) return;
			try {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({ ...c, status: "parsing" as const }),
				});
				const result = await session.result.processor.execute(structuredClone(cell));
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: result.cell.status,
						parsedOutput: result.cell.parsedOutput,
						errorMessage: result.cell.errorMessage,
						workspaceCommands: result.cell.workspaceCommands,
						metadata: result.cell.metadata,
						updatedAt: result.cell.updatedAt,
					}),
				});
			} catch (err) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					}),
				});
			}
		},
		[session],
	);

	const previewCell = useCallback(
		async (cell: Cell) => {
			if (!session) return;
			try {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({ ...c, status: "parsing" as const }),
				});
				const { candidate, error } = await PreviewWorkflow.createCandidate(
					cell,
					session.result.processor,
					session.sessionId,
				);
				if (error || !candidate) {
					dispatch({
						type: "UPDATE_CELL",
						cellId: cell.cellId,
						updater: (c) => ({ ...c, status: "error", errorMessage: error }),
					});
					return;
				}
				dispatch({ type: "SET_PREVIEW", preview: candidate });
			} catch (err) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					}),
				});
			}
		},
		[session],
	);

	const acceptPreview = useCallback(
		async (candidate: import("@stateful-mcp/clinical/session/preview-candidate").PreviewCandidate) => {
			if (!session) return;
			const cell = state.cells.find((c) => c.cellId === candidate.cellId);
			if (!cell) return;
			const { valid, error } = PreviewWorkflow.validateFingerprint(candidate, cell);
			if (!valid) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({ ...c, status: "error", errorMessage: error }),
				});
				dispatch({ type: "CLEAR_PREVIEW" });
				return;
			}
			dispatch({ type: "CLEAR_PREVIEW" });
			await runCell(cell);
		},
		[session, state.cells, runCell],
	);

	const dispatchCommand = useCallback(
		async (line: string): Promise<{ success: boolean; message?: string; action?: string; data?: unknown }> => {
			if (!session) return { success: false, message: "no session" };
			const registry = (session.result.processor as any).cellCommandRegistry;
			const dispatcher = new CommandDispatcher({
				sessionId: session.sessionId,
				activeCell: state.cells[state.activeIndex],
				allCells: state.cells,
				editorRegistry: editorRegistryRef.current,
				cellCommandRegistry: registry,
				processor: session.result.processor,
			});
			const result = await dispatcher.dispatch(line);
			if (result.commands) {
				for (const cmd of result.commands as any[]) {
					if (cmd.type === "UPDATE_CELL") {
						dispatch({ type: "UPDATE_CELL", cellId: cmd.cellId, updater: cmd.updater });
					}
				}
			}
			dispatch({ type: "EXIT_COMMAND_MODE" });
			if (result.message) {
				dispatch({ type: "SET_MESSAGE", message: result.message });
			}
			return { success: result.success, message: result.message, action: result.action, data: result.data };
		},
		[session, state.activeIndex, state.cells],
	);

	const nextErrorIndex = useCallback((): number | null => {
		for (let i = state.activeIndex + 1; i < state.cells.length; i++) {
			if (state.cells[i]?.status === "error") return i;
		}
		for (let i = 0; i < state.activeIndex; i++) {
			if (state.cells[i]?.status === "error") return i;
		}
		return null;
	}, [state.activeIndex, state.cells]);

	const prevErrorIndex = useCallback((): number | null => {
		for (let i = state.activeIndex - 1; i >= 0; i--) {
			if (state.cells[i]?.status === "error") return i;
		}
		for (let i = state.cells.length - 1; i > state.activeIndex; i--) {
			if (state.cells[i]?.status === "error") return i;
		}
		return null;
	}, [state.activeIndex, state.cells]);

	const setSessionMode = useCallback((mode: ExecutionPolicy) => {
		dispatch({ type: "SET_SESSION_MODE", mode });
	}, []);

	const getAutocomplete = useCallback(
		(partial: string) => {
			if (!session) return [];
			const registry = (session.result.processor as any).cellCommandRegistry;
			const editorDescs = editorRegistryRef.current.getDescriptors();
			const cellDescs = registry?.getDescriptors?.() ?? [];
			const suggestions = getAutocompleteSuggestions(partial, editorDescs, cellDescs);

			// When a verb is fully typed and a space follows, inject profile-based completions
			if (partial.includes(" ")) {
				const verb = partial.slice(0, partial.indexOf(" "));
				const matchedDesc = [...editorDescs, ...cellDescs].find(
					(d) => d.verb === verb,
				);
				if (matchedDesc) {
					// Already handled by getAutocompleteSuggestions → arg names/completions
				} else {
					// Unknown verb — try to inject field/tag mappings from profile
					try {
						const parser = (session.result.engine as any).parser;
						if (parser && typeof parser.getProfile === "function") {
							const profile = parser.getProfile();
							const fieldKeys = Object.keys(profile.fieldMappings ?? {});
							const tagKeys = Object.keys(profile.tagMappings ?? {});
							const all = [...fieldKeys, ...tagKeys].filter(
								(k) => k.startsWith(partial.slice(partial.indexOf(" ") + 1)),
							);
							for (const key of all) {
								suggestions.push({
									verb: key,
									group: "field",
									source: "cell" as const,
									hasArgs: false,
								});
							}
						}
					} catch {
						// profile not available
					}
				}
			}

			return suggestions;
		},
		[session],
	);

	return {
		state,
		dispatch,
		insertBelow,
		insertAbove,
		createCell,
		runCell,
		previewCell,
		acceptPreview,
		setSessionMode,
		dispatchCommand,
		nextErrorIndex,
		prevErrorIndex,
		getAutocomplete,
	};
}