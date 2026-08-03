import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { ExecutionPolicy, NotebookAction, NotebookState } from "@stateful-mcp/clinical/notebook/notebook-state";
import { INITIAL_NOTEBOOK_STATE, notebookReducer } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { PreviewCandidate } from "@stateful-mcp/clinical/session/preview-candidate";
import type { Cell } from "@stateful-mcp/clinical/session/cell";
import { useCallback, useReducer, useState } from "react";
import type { SessionState } from "./useSession";

export type { AutocompleteSuggestion };
export type { ExecutionPolicy, NotebookAction, NotebookState };

export interface CellSuggestion {
	text: string;
	kind: string;
	detail?: string;
}

export interface UseNotebookReturn {
	state: NotebookState;
	dispatch: (action: NotebookAction) => void;
	insertBelow(sessionId: string): void;
	insertAbove(sessionId: string): void;
	createCell(sessionId: string, rawInput?: string): Cell;
	runCell(cell: Cell): Promise<void>;
	previewCell(cell: Cell): Promise<void>;
	acceptPreview(candidate: PreviewCandidate): Promise<void>;
	setSessionMode(mode: ExecutionPolicy): void;
	dispatchCommand(line: string): Promise<{ success: boolean; message?: string; action?: string; data?: unknown }>;
	nextErrorIndex(): number | null;
	prevErrorIndex(): number | null;
	getAutocomplete(partial: string): AutocompleteSuggestion[];
	cellSuggestions: CellSuggestion[];
}

/**
 * CLI2 editor adapter. The reducer and legacy Cell shape remain presentation
 * compatibility for the copied Ink shell; all domain execution is V2-owned.
 */
export function useNotebook(session: SessionState | null): UseNotebookReturn {
	const [state, dispatch] = useReducer(notebookReducer, INITIAL_NOTEBOOK_STATE);
	const [cellSuggestions] = useState<CellSuggestion[]>([]);

	const createCell = useCallback((sessionId: string, rawInput = ""): Cell => ({
		cellId: `cli2-cell-${crypto.randomUUID()}`,
		sessionId,
		collection: { kind: "notebook", collectionId: sessionId },
		intentKind: "prose",
		mode: "cdsl",
		rawInput,
		routing: { scope: "global", targetSchema: null },
		parsedOutput: null,
		status: "draft",
		updatedAt: new Date().toISOString(),
		context: { objects: {} },
	}), []);

	const insertBelow = useCallback((sessionId: string) => {
		dispatch({ type: "INSERT_CELL", cell: createCell(sessionId), position: state.activeIndex + 1 });
	}, [createCell, state.activeIndex]);

	const insertAbove = useCallback((sessionId: string) => {
		dispatch({ type: "INSERT_CELL", cell: createCell(sessionId), position: state.activeIndex });
	}, [createCell, state.activeIndex]);

	const runCell = useCallback(async (cell: Cell) => {
		void cell;
		dispatch({ type: "SET_MESSAGE", message: "CLI2 V2 cell execution is not wired yet" });
	}, []);

	const previewCell = useCallback(async (cell: Cell) => {
		void cell;
		dispatch({ type: "SET_MESSAGE", message: "CLI2 V2 cell preview is not wired yet" });
	}, []);

	const acceptPreview = useCallback(async (candidate: PreviewCandidate) => {
		void candidate;
		dispatch({ type: "CLEAR_PREVIEW" });
	}, []);

	const dispatchCommand = useCallback(async (line: string) => {
		if (!session) return { success: false, message: "V2 session is not ready" };
		const profile = session.v2.syntaxProfile;
		if (!line.trim().startsWith(profile.directCommandToken)) {
			return { success: false, message: "CLI2 V2 accepts direct ':' commands or '^' macros" };
		}
		const result = await session.v2.commandBar.execute({
			rawText: line,
			sessionId: session.sessionId,
		});
		dispatch({ type: "EXIT_COMMAND_MODE" });
		const message = result.status === "committed" ? "V2 command committed" : result.error ?? "V2 command failed";
		dispatch({ type: "SET_MESSAGE", message });
		return { success: result.status === "committed", message, data: result };
	}, [session]);

	const getAutocomplete = useCallback((partial: string): AutocompleteSuggestion[] => {
		if (!session) return [];
		const profile = session.v2.syntaxProfile;
		const token = state.mode === "MACRO" ? profile.macroStartToken : profile.directCommandToken;
		const mappings = state.mode === "MACRO"
			? {}
			: { ...profile.editorCommandMappings, ...profile.directCommandMappings, [profile.variableCommandName]: "variable" };
		return Object.keys(mappings)
			.filter((alias) => alias.startsWith(partial))
			.map((alias) => ({
				verb: alias,
				completionText: `${token}${alias}`,
				group: state.mode === "MACRO" ? "macro" : "v2",
				source: "editor" as const,
				hasArgs: false,
				kind: "verb" as const,
			}));
	}, [session, state.mode]);

	const nextErrorIndex = useCallback((): number | null => {
		for (let i = state.activeIndex + 1; i < state.cells.length; i += 1)
			if (state.cells[i]?.status === "error") return i;
		return null;
	}, [state.activeIndex, state.cells]);

	const prevErrorIndex = useCallback((): number | null => {
		for (let i = state.activeIndex - 1; i >= 0; i -= 1)
			if (state.cells[i]?.status === "error") return i;
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
		setSessionMode: (mode) => dispatch({ type: "SET_SESSION_MODE", mode }),
		dispatchCommand,
		nextErrorIndex,
		prevErrorIndex,
		getAutocomplete,
		cellSuggestions,
	};
}
