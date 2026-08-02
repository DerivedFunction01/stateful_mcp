import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { getAutocompleteSuggestions } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { CommandDispatcher } from "@stateful-mcp/clinical/notebook/command-dispatcher";
import type { ExecutionPolicy } from "@stateful-mcp/clinical/notebook/notebook-state";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { PreviewWorkflow } from "@stateful-mcp/clinical/notebook/preview-workflow";
import type { Cell } from "@stateful-mcp/clinical/session/cell";
import { resolveArgCompletions } from "@stateful-mcp/clinical/session/command-completions";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { rankHistory } from "@stateful-mcp/clinical/session/history-ranker";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SessionState } from "./useSession";

export type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
export type {
	ExecutionPolicy,
	NotebookAction,
	NotebookState,
} from "@stateful-mcp/clinical/notebook/notebook-state";

export interface UseNotebookReturn {
	state: import("@stateful-mcp/clinical/notebook/notebook-state").NotebookState;
	dispatch: (
		action: import("@stateful-mcp/clinical/notebook/notebook-state").NotebookAction,
	) => void;
	insertBelow(sessionId: string): void;
	insertAbove(sessionId: string): void;
	createCell(sessionId: string, rawInput?: string): Cell;
	runCell(cell: Cell): Promise<void>;
	previewCell(cell: Cell): Promise<void>;
	acceptPreview(
		candidate: import("@stateful-mcp/clinical/session/preview-candidate").PreviewCandidate,
	): Promise<void>;
	setSessionMode(mode: ExecutionPolicy): void;
	dispatchCommand(line: string): Promise<{
		success: boolean;
		message?: string;
		action?: string;
		data?: unknown;
	}>;
	nextErrorIndex(): number | null;
	prevErrorIndex(): number | null;
	getAutocomplete(partial: string): AutocompleteSuggestion[];
	cellSuggestions: CellSuggestion[];
}

export interface CellSuggestion {
	text: string;
	kind: string;
	detail?: string;
}

async function computeSuggestions(
	text: string,
	session: SessionState,
): Promise<CellSuggestion[]> {
	const triggers = ["#", "^", "@", "{"];
	let lastIdx = -1;
	let lastTrigger = "";
	for (const t of triggers) {
		const idx = text.lastIndexOf(t);
		if (idx > lastIdx) {
			lastIdx = idx;
			lastTrigger = t;
		}
	}
	if (lastIdx < 0) return [];

	// Try engine suggestAutocomplete first (C3)
	try {
		const engine =
			(session.result as any).engine ??
			(session.result as any).processor?.engine;
		if (engine && typeof engine.suggestAutocomplete === "function") {
			const results = await engine.suggestAutocomplete(text);
			if (results && results.length > 0) {
				return results
					.slice(0, 6)
					.map((r: any) => ({
						text: r.insertText ?? "",
						kind: r.kind ?? lastTrigger,
						detail: r.targetSchema ?? r.detail,
					}))
					.filter((r: CellSuggestion) => r.text);
			}
		}
	} catch {
		// engine.suggestAutocomplete not available
	}

	// Fallback: tag completions from profile.tagMappings (H2)
	if (lastTrigger === "#") {
		try {
			const parser = (session.result.engine as any).parser;
			if (parser && typeof parser.getProfile === "function") {
				const profile = parser.getProfile();
				const tagKeys = Object.keys(profile.tagMappings ?? {});
				const prefix = text.slice(lastIdx + 1).toLowerCase();
				return tagKeys
					.filter((k) => k.startsWith(prefix))
					.slice(0, 8)
					.map((k) => ({
						text: `#${k}`,
						kind: "tag",
						detail: profile.tagMappings[k],
					}));
			}
		} catch {
			// profile not available
		}
	}
	return [];
}

export interface CellSuggestion {
	text: string;
	kind: string;
	detail?: string;
}

export function useNotebook(session: SessionState | null) {
	const [state, dispatch] = useReducer(notebookReducer, INITIAL_NOTEBOOK_STATE);
	const editorRegistryRef = useRef(EditorCommandRegistry.createDefault());
	const [cellSuggestions, setCellSuggestions] = useState<CellSuggestion[]>([]);
	const hydratedRef = useRef(false);

	// Hydrate the editor document from the durable notebook store once per session.
	// The hydrated flag is set only AFTER hydration completes so the persist
	// effect never writes an empty document over an existing one.
	useEffect(() => {
		if (!session || hydratedRef.current) return;
		(async () => {
			const doc = await session.notebook.loadDocument(session.sessionId);
			if (!doc) {
				hydratedRef.current = true;
				return;
			}
			const collection = await session.notebook.loadCollection(
				session.sessionId,
				{
					kind: "notebook",
					collectionId: session.sessionId,
				},
			);
			const ordering = collection?.ordering ?? doc.ordering;
			const storedCells = await Promise.all(
				ordering.map((id) => session.result.cellStore.get(id)),
			);
			const cells = storedCells.some(Boolean)
				? storedCells.filter((c): c is Cell => Boolean(c))
				: ordering
						.map((id) => doc.cells[id])
						.filter((c): c is Cell => Boolean(c));
			if (cells.length > 0) {
				dispatch({ type: "SET_CELLS", cells });
			}
			dispatch({
				type: "SET_ACTIVE_INDEX",
				index: collection?.activeIndex ?? doc.activeIndex,
			});
			// Restore the in-progress draft only if the active cell is mid-edit;
			// otherwise ignore the persisted draft to avoid resurrecting stale text.
			const active = cells[doc.activeIndex];
			if (active && (collection?.draftText || doc.draftText)) {
				dispatch({
					type: "SET_DRAFT_TEXT",
					text: collection?.draftText ?? doc.draftText,
				});
			}
			hydratedRef.current = true;
		})();
	}, [session]);

	// Persist the session document (debounced) whenever document-relevant state changes.
	useEffect(() => {
		if (!session || !hydratedRef.current) return;
		const timeout = setTimeout(() => {
			const ordering = state.cells.map((c) => c.cellId);
			const activeCell = state.cells[state.activeIndex];
			// Only persist draftText when actively editing; otherwise store "" so a
			// stale draft is never resurrected on the next launch.
			const draft =
				state.mode === "INSERT" && activeCell ? state.draftText : "";
			for (const cell of state.cells) {
				void session.result.cellStore.save(cell);
			}
			void session.notebook.saveDocument({
				sessionId: session.sessionId,
				updatedAt: new Date().toISOString(),
				ordering,
				cells: {},
				activeIndex: state.activeIndex,
				draftText: draft,
			});
			void session.notebook.saveCollection(session.sessionId, {
				collection: { kind: "notebook", collectionId: session.sessionId },
				ordering,
				activeIndex: state.activeIndex,
				draftText: draft,
			});
		}, 250);
		return () => clearTimeout(timeout);
	}, [state.cells, state.activeIndex, state.draftText, state.mode, session]);

	useEffect(() => {
		if (!session || state.mode !== "INSERT" || !state.draftText) {
			setCellSuggestions([]);
			return;
		}
		const text = state.draftText;
		const timer = setTimeout(async () => {
			try {
				const s = await computeSuggestions(text, session);
				setCellSuggestions(s);
			} catch {
				setCellSuggestions([]);
			}
		}, 120);
		return () => clearTimeout(timer);
	}, [state.draftText, state.mode, session]);

	const createCell = useCallback(
		(sessionId: string, rawInput = ""): Cell => ({
			cellId: `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			sessionId,
			collection: { kind: "notebook", collectionId: sessionId },
			intentKind: "prose",
			mode: "cdsl",
			rawInput,
			routing: {
				scope: "global",
				targetSchema: state.defaultSchema,
				resolvedSection:
					state.defaultSection as Cell["routing"]["resolvedSection"],
			},
			parsedOutput: null,
			status: "draft",
			updatedAt: new Date().toISOString(),
			context: { objects: {} },
		}),
		[state.defaultSection, state.defaultSchema],
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
				const result = await session.result.processor.execute(
					structuredClone(cell),
				);
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
		async (
			candidate: import("@stateful-mcp/clinical/session/preview-candidate").PreviewCandidate,
		) => {
			if (!session) return;
			const cell = state.cells.find((c) => c.cellId === candidate.cellId);
			if (!cell) return;
			const { valid, error } = PreviewWorkflow.validateFingerprint(
				candidate,
				cell,
			);
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
		async (
			line: string,
		): Promise<{
			success: boolean;
			message?: string;
			action?: string;
			data?: unknown;
		}> => {
			if (!session) return { success: false, message: "no session" };
			const registry = (session.result.processor as any).cellCommandRegistry;

			let selectedIndexes: number[] | undefined;
			if (state.mode === "VISUAL") {
				const lo = Math.min(state.visualStart, state.visualEnd);
				const hi = Math.max(state.visualStart, state.visualEnd);
				selectedIndexes = [];
				for (let i = lo; i <= hi; i++) selectedIndexes.push(i);
			}

			const dispatcher = new CommandDispatcher({
				sessionId: session.sessionId,
				activeCell: state.cells[state.activeIndex],
				allCells: state.cells,
				editorRegistry: editorRegistryRef.current,
				cellCommandRegistry: registry,
				processor: session.result.processor,
				engine: session.result.engine,
				parser: session.result.engine.getParser(),
				workspaceStore: session.result.engine.getWorkspaceStore(),
				profile: session.result.engine.getParser().getProfile(),
				selectedIndexes,
			});
			const result = await dispatcher.dispatch(line);
			if (result.commands) {
				for (const cmd of result.commands as any[]) {
					if (cmd.type === "UPDATE_CELL") {
						dispatch({
							type: "UPDATE_CELL",
							cellId: cmd.cellId,
							updater: cmd.updater,
						});
					}
				}
			}
			dispatch({ type: "EXIT_COMMAND_MODE" });
			if (result.message) {
				dispatch({ type: "SET_MESSAGE", message: result.message });
			}
			return {
				success: result.success,
				message: result.message,
				action: result.action,
				data: result.data,
			};
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
			const profile = session.result.engine.getParser().getProfile();
			const mappedCellDescs = Object.entries(profile.cellCommandMappings ?? {})
				.map(([alias, canonical]) => {
					const descriptor = cellDescs.find(
						(d: CommandDescriptor) => d.verb === canonical,
					);
					return descriptor && descriptor.verb !== alias
						? { ...descriptor, verb: alias, aliases: [canonical] }
						: null;
				})
				.filter((d): d is NonNullable<typeof d> => d !== null);
			const autocompleteCellDescs = [...cellDescs, ...mappedCellDescs];

			const spaceIdx = partial.indexOf(" ");
			if (spaceIdx >= 0) {
				const verb = partial.slice(0, spaceIdx);
				const afterVerb = partial.slice(spaceIdx + 1);
				const argParts = afterVerb.split(" ");
				const argIndex = Math.max(0, argParts.length - 1);
				const currentPartial = argParts[argIndex] ?? "";

				const canonicalVerb = profile.cellCommandMappings?.[verb] ?? verb;
				const matchedDesc = [...editorDescs, ...autocompleteCellDescs].find(
					(d) => d.verb === verb || d.verb === canonicalVerb,
				);

				if (matchedDesc) {
					const argSchema = matchedDesc.args[argIndex];
					if (argSchema?.completions && argSchema.completions.length > 0) {
						return argSchema.completions
							.filter((c: string) => c.startsWith(currentPartial))
							.map((c: string) => ({
								verb: c,
								group: matchedDesc.group,
								source:
									matchedDesc.verb === verb ? "editor" : ("cell" as const),
								hasArgs: false,
								kind: "arg" as const,
								argIndex,
								argName: argSchema.name,
								descriptionKey: argSchema.descriptionKey,
							}));
					}
				}

				// Command-aware, locale-neutral completions for the typed verb.
				// Falls back to empty (no suggestions) for unrelated verbs rather than
				// suggesting SOAP sections for everything.
				try {
					const engine = (session.result as any).engine;
					const parser = (session.result.engine as any).parser;
					const profile =
						parser && typeof parser.getProfile === "function"
							? parser.getProfile()
							: undefined;
					if (profile) {
						const prevArgs = argParts.slice(0, -1);
						const codes = resolveArgCompletions(
							canonicalVerb,
							argIndex,
							profile,
							prevArgs,
							engine?.getSchemasForSection?.bind(engine),
						);
						return codes
							.filter((c) => c.code.startsWith(currentPartial))
							.map((c) => ({
								verb: c.code,
								group: c.group,
								source:
									matchedDesc?.verb === verb ? "editor" : ("cell" as const),
								hasArgs: false,
								kind: "arg" as const,
								argIndex,
								argName: matchedDesc?.args[argIndex]?.name,
								descriptionKey: matchedDesc?.args[argIndex]?.descriptionKey,
							}));
					}
				} catch {
					// resolver not available
				}

				return [];
			}

			if (partial === "") {
				const ranked = rankHistory(state.commandHistory, {
					limit: 8,
					frequency: state.commandFrequency,
				});
				return ranked.map((line) => ({
					verb: line.slice(1),
					group: "history" as const,
					source: "editor" as const,
					hasArgs: false,
					kind: "verb" as const,
				}));
			}

			const suggestions = getAutocompleteSuggestions(
				partial,
				editorDescs,
				autocompleteCellDescs,
			);
			if (suggestions.length > 0) return suggestions;

			// No-match fallback: offer ranked command history entries whose verb
			// starts with the typed prefix. Strictly additive — never mutates the
			// typed line; Enter still dispatches so the dispatcher surfaces errors.
			const historyFallback = rankHistory(state.commandHistory, {
				limit: 6,
				frequency: state.commandFrequency,
			})
				.filter((line) => line.slice(1).startsWith(partial))
				.map((line) => ({
					verb: line.slice(1),
					group: "history" as const,
					source: "editor" as const,
					hasArgs: false,
					kind: "verb" as const,
				}));
			return historyFallback;
		},
		[session, state.commandHistory, state.commandFrequency],
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
		cellSuggestions,
	};
}
