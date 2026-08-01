import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { PreviewCandidate } from "@stateful-mcp/clinical/session/preview-candidate";
import { computeInputFingerprint } from "@stateful-mcp/clinical/session/preview-candidate";
import type { EditorMode } from "../lib/keymap";
import { useCallback, useReducer } from "react";
import type { SessionState } from "./useSession";

export type ExecutionPolicy = "execute" | "preview";

export interface UndoEntry {
	cells: Cell[];
	activeIndex: number;
	draftText: string;
}

export interface NotebookState {
	cells: Cell[];
	activeIndex: number;
	mode: EditorMode;
	draftText: string;
	lastEditCellId: string | null;
	undoStack: UndoEntry[];
	redoStack: UndoEntry[];
	dirty: boolean;
	sessionMode: ExecutionPolicy;
	preview: PreviewCandidate | null;
}

export type NotebookAction =
	| { type: "SET_CELLS"; cells: Cell[] }
	| { type: "MOVE_CURSOR"; delta: number }
	| { type: "SET_ACTIVE_INDEX"; index: number }
	| { type: "ENTER_INSERT_MODE" }
	| { type: "EXIT_INSERT_MODE" }
	| { type: "TYPE_CHAR"; char: string }
	| { type: "BACKSPACE" }
	| { type: "COMMIT_CELL" }
	| { type: "INSERT_CELL"; cell: Cell; position: number }
	| { type: "DELETE_ACTIVE_CELL" }
	| { type: "SET_CELL_TEXT"; cellId: string; text: string }
	| { type: "UPDATE_CELL"; cellId: string; updater: (c: Cell) => Cell }
	| { type: "UNDO" }
	| { type: "REDO" }
	| { type: "SET_SESSION_MODE"; mode: ExecutionPolicy }
	| { type: "SET_PREVIEW"; preview: PreviewCandidate }
	| { type: "CLEAR_PREVIEW" };

function snapshot(state: NotebookState): UndoEntry {
	return {
		cells: state.cells.map((c) => structuredClone(c)),
		activeIndex: state.activeIndex,
		draftText: state.draftText,
	};
}

function pushUndo(
	state: NotebookState,
): { undoStack: UndoEntry[]; redoStack: UndoEntry[] } {
	return {
		undoStack: [...state.undoStack.slice(-49), snapshot(state)],
		redoStack: [],
	};
}

const INITIAL: NotebookState = {
	cells: [],
	activeIndex: 0,
	mode: "NORMAL",
	draftText: "",
	lastEditCellId: null,
	undoStack: [],
	redoStack: [],
	dirty: false,
	sessionMode: "execute",
	preview: null,
};

function notebookReducer(
	state: NotebookState,
	action: NotebookAction,
): NotebookState {
	switch (action.type) {
		case "SET_CELLS":
			return { ...state, cells: action.cells };

		case "MOVE_CURSOR": {
			const maxIdx = Math.max(0, state.cells.length - 1);
			const newIdx = Math.max(
				0,
				Math.min(state.activeIndex + action.delta, maxIdx),
			);
			return { ...state, activeIndex: newIdx };
		}

		case "SET_ACTIVE_INDEX":
			return { ...state, activeIndex: action.index };

		case "ENTER_INSERT_MODE": {
			const cell = state.cells[state.activeIndex];
			if (!cell) return state;
			const { undoStack, redoStack } = pushUndo(state);
			return {
				...state,
				mode: "INSERT",
				draftText: cell.rawInput,
				lastEditCellId: cell.cellId,
				undoStack,
				redoStack,
				dirty: true,
			};
		}

		case "EXIT_INSERT_MODE": {
			const { undoStack, redoStack } = pushUndo(state);
			const cells = state.cells.map((c) => {
				if (c.cellId === state.lastEditCellId) {
					return {
						...c,
						rawInput: state.draftText,
						updatedAt: new Date().toISOString(),
					};
				}
				return c;
			});
			return {
				...state,
				mode: "NORMAL",
				cells,
				undoStack,
				redoStack,
			};
		}

		case "TYPE_CHAR": {
			return {
				...state,
				draftText: state.draftText + action.char,
			};
		}

		case "BACKSPACE": {
			return {
				...state,
				draftText: state.draftText.slice(0, -1),
			};
		}

		case "COMMIT_CELL": {
			const { undoStack, redoStack } = pushUndo(state);
			const cells = state.cells.map((c) => {
				if (c.cellId === state.lastEditCellId) {
					return {
						...c,
						rawInput: state.draftText,
						updatedAt: new Date().toISOString(),
					};
				}
				return c;
			});
			return {
				...state,
				mode: "NORMAL",
				cells,
				undoStack,
				redoStack,
			};
		}

		case "INSERT_CELL": {
			const { undoStack, redoStack } = pushUndo(state);
			const cells = [...state.cells];
			const insertAt = Math.min(action.position, cells.length);
			cells.splice(insertAt, 0, action.cell);
			const newIndex = insertAt;
			return {
				...state,
				cells,
				activeIndex: newIndex,
				undoStack,
				redoStack,
				dirty: true,
			};
		}

		case "DELETE_ACTIVE_CELL": {
			if (state.cells.length === 0) return state;
			const { undoStack, redoStack } = pushUndo(state);
			const cells = state.cells.filter(
				(_, i) => i !== state.activeIndex,
			);
			const newIndex = Math.min(
				state.activeIndex,
				Math.max(0, cells.length - 1),
			);
			return {
				...state,
				cells,
				activeIndex: newIndex,
				undoStack,
				redoStack,
				dirty: true,
			};
		}

		case "SET_CELL_TEXT": {
			const cells = state.cells.map((c) => {
				if (c.cellId === action.cellId) {
					return { ...c, rawInput: action.text };
				}
				return c;
			});
			return { ...state, cells };
		}

		case "UPDATE_CELL": {
			const cells = state.cells.map((c) => {
				if (c.cellId === action.cellId) return action.updater(c);
				return c;
			});
			return { ...state, cells };
		}

		case "UNDO": {
			if (state.undoStack.length === 0) return state;
			const prev = state.undoStack[state.undoStack.length - 1]!;
			const redoStack = [...state.redoStack, snapshot(state)];
			const undoStack = state.undoStack.slice(0, -1);
			return {
				...state,
				cells: prev.cells,
				activeIndex: prev.activeIndex,
				draftText: prev.draftText,
				mode: "NORMAL",
				preview: null,
				undoStack,
				redoStack,
			};
		}

		case "REDO": {
			if (state.redoStack.length === 0) return state;
			const next = state.redoStack[state.redoStack.length - 1]!;
			const undoStack = [...state.undoStack, snapshot(state)];
			const redoStack = state.redoStack.slice(0, -1);
			return {
				...state,
				cells: next.cells,
				activeIndex: next.activeIndex,
				draftText: next.draftText,
				mode: "NORMAL",
				preview: null,
				undoStack,
				redoStack,
			};
		}

		case "SET_SESSION_MODE":
			return { ...state, sessionMode: action.mode };

		case "SET_PREVIEW":
			return { ...state, preview: action.preview };

		case "CLEAR_PREVIEW":
			return { ...state, preview: null };

		default:
			return state;
	}
}

export function useNotebook(session: SessionState | null) {
	const [state, dispatch] = useReducer(notebookReducer, INITIAL);

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
			dispatch({
				type: "INSERT_CELL",
				cell,
				position: state.activeIndex + 1,
			});
		},
		[state.activeIndex, createCell],
	);

	const insertAbove = useCallback(
		(sessionId: string) => {
			const cell = createCell(sessionId);
			dispatch({
				type: "INSERT_CELL",
				cell,
				position: state.activeIndex,
			});
		},
		[state.activeIndex, createCell],
	);

	const runCell = useCallback(
		async (cell: Cell) => {
			if (!session) return;
			const processor = session.result.processor;
			try {
				const result = await processor.execute(
					structuredClone(cell),
				);
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => {
						const updated = result.cell;
						return {
							...c,
							status: updated.status,
							parsedOutput: updated.parsedOutput,
							errorMessage: updated.errorMessage,
							workspaceCommands: updated.workspaceCommands,
							metadata: updated.metadata,
							updatedAt: updated.updatedAt,
						};
					},
				});
			} catch (err) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: "error",
						errorMessage:
							err instanceof Error ? err.message : String(err),
					}),
				});
			}
		},
		[session],
	);

	const previewCell = useCallback(
		async (cell: Cell) => {
			if (!session) return;
			const processor = session.result.processor;
			try {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({ ...c, status: "parsing" as const }),
				});

				const clone = structuredClone(cell);
				const result = await processor.preview(clone);

				const previewError = result.error;
				if (previewError) {
					dispatch({
						type: "UPDATE_CELL",
						cellId: cell.cellId,
						updater: (c) => ({
							...c,
							status: "error" as const,
							errorMessage: previewError.message ?? "preview failed",
						}),
					});
					return;
				}

				const fingerprint = computeInputFingerprint(
					cell.rawInput,
					cell.routing.targetSchema,
				);

				const candidate: PreviewCandidate = {
					candidateId: `preview_${cell.cellId}_${Date.now()}`,
					sessionId: session.sessionId,
					cellId: cell.cellId,
					rawInput: cell.rawInput,
					inputFingerprint: fingerprint,
					profileFingerprint: "memory",
					parsedOutput: result.preview ?? null,
					warnings: [],
					diagnostics: [],
					status: 0 as any,
					createdAt: new Date().toISOString(),
				};

				dispatch({ type: "SET_PREVIEW", preview: candidate });
			} catch (err) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: "error",
						errorMessage:
							err instanceof Error ? err.message : String(err),
					}),
				});
			}
		},
		[session],
	);

	const acceptPreview = useCallback(
		async (candidate: PreviewCandidate) => {
			if (!session) return;
			const cell = state.cells.find(
				(c) => c.cellId === candidate.cellId,
			);
			if (!cell) return;

			const currentFingerprint = computeInputFingerprint(
				cell.rawInput,
				cell.routing.targetSchema,
			);
			if (currentFingerprint !== candidate.inputFingerprint) {
				dispatch({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: (c) => ({
						...c,
						status: "error" as const,
						errorMessage: "preview stale — cell was edited since preview",
					}),
				});
				dispatch({ type: "CLEAR_PREVIEW" });
				return;
			}

			dispatch({ type: "CLEAR_PREVIEW" });
			await runCell(cell);
		},
		[session, state.cells, runCell],
	);

	const setSessionMode = useCallback(
		(mode: ExecutionPolicy) => {
			dispatch({ type: "SET_SESSION_MODE", mode });
		},
		[],
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
	};
}