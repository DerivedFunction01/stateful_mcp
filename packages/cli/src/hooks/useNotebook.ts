import type {
	MacroDefinition,
	MacroDraftPreview,
} from "@stateful-mcp/clinical";
import { MacroAuthoringSession } from "@stateful-mcp/clinical";
import type { CellPreview } from "@stateful-mcp/clinical/cells/cell-service-types";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { CommandHistoryCandidate } from "@stateful-mcp/clinical/learning/command-history";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	type NotebookEditorAction,
	type NotebookEditorState,
	type NotebookMacroLock,
	type NotebookRunMode,
	reduceNotebookEditor,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { globalRegistry } from "../lib/editor/argument-autocomplete-registry";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import {
	argumentSuggestions,
	dedupeCanonicalSuggestions,
	historySuggestions,
	rankArgumentSuggestions,
} from "../lib/editor/command-autocomplete";
import { buildCommandDescriptors } from "../lib/editor/command-descriptors";
import {
	activeMacroSlot,
	createExplicitMacroLock,
	type MacroSlotProjection,
} from "../lib/editor/macro-slots";
import type { SessionState } from "./useSession";

export interface CellSuggestion {
	text: string;
	kind: string;
	detail?: string;
}

export { selectUnambiguousExpression } from "@stateful-mcp/clinical";

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
	macroDraftPreview?: MacroDraftPreview;
	macroSlots: MacroSlotProjection[];
	macroLocks: NotebookMacroLock[];
	unlockActiveMacroSlot(): void;
	lockActiveMacroSlot(): void;
	refreshSnapshot(): Promise<void>;
	commitEditorDraft(): Promise<void>;
	commitMacro(): Promise<void>;
	reverseActiveMacro(): Promise<void>;
	setEditingCell(cellId: string | null): void;
	supersedeActiveCell(): Promise<StructuredCell | null>;
	cancelActive(): Promise<boolean>;
	moveActive(delta: -1 | 1): Promise<void>;
	moveSelection(delta: -1 | 1): Promise<void>;
	activeDefinition: MacroDefinition | null;
	childDefinitions: MacroDefinition[];
	macroSession?: MacroAuthoringSession;
}

export type {
	AutocompleteSuggestion,
	NotebookEditorAction,
	NotebookEditorState,
};

export function useNotebook(
	session: SessionState | null,
	options: { onOpenHistory?: () => void } = {},
): UseNotebookReturn {
	const [state, dispatch] = useReducer(
		reduceNotebookEditor,
		INITIAL__NOTEBOOK_EDITOR_STATE,
	);
	const isMacroAuthoring =
		(state.mode === "INSERT" && state.commandKind === "macro") ||
		state.mode === "MACRO";
	const [cellSuggestions] = useState<CellSuggestion[]>([]);
	const [macroSlots, setMacroSlots] = useState<MacroSlotProjection[]>([]);
	const [macroDraftPreview, setMacroDraftPreview] =
		useState<MacroDraftPreview>();
	const [activeDefinition, setActiveDefinition] =
		useState<MacroDefinition | null>(null);
	const [childDefinitions, setChildDefinitions] = useState<MacroDefinition[]>(
		[],
	);
	const [commandHistoryCandidates, setCommandHistoryCandidates] = useState<
		CommandHistoryCandidate[]
	>([]);

	const macroSessionRef = useRef<MacroAuthoringSession | undefined>(undefined);

	useEffect(() => {
		if (session?.v2.syntaxProfile) {
			const prof = session.v2.syntaxProfile;
			const sess = new MacroAuthoringSession({
				profile: {
					profileId: prof.profileId ?? "default",
					macroStartToken: prof.macroStartToken,
					directCommandToken: prof.directCommandToken,
					expressionToken: prof.expressionToken,
					conceptToken: prof.conceptToken,
					conceptCodeSeparator: prof.conceptCodeSeparator ?? ":",
				},
				initialText: state.draftText,
				initialCursor: state.cursorOffset,
			});
			macroSessionRef.current = sess;
		}
	}, [session?.v2.syntaxProfile]);
	const [argumentSuggestionsList, setArgumentSuggestionsList] = useState<
		AutocompleteSuggestion[]
	>([]);
	const editingCellIdRef = useRef<string | null>(null);
	const editingRevisionRef = useRef<number>(0);

	useEffect(() => {
		if (session) {
			globalRegistry.setHistoryStore(session.v2.commandHistoryStore);
			if (session.v2.commandBar.variableService) {
				globalRegistry.setVariableReader(session.v2.commandBar.variableService);
			}
		}
	}, [session]);

	useEffect(() => {
		let cancelled = false;
		if (!session || isMacroAuthoring || !state.draftText) {
			setArgumentSuggestionsList([]);
			return;
		}

		const profile = session.v2.syntaxProfile;
		const descriptors = buildCommandDescriptors(profile, {
			variableName: profile.variableCommandName,
			variableAliases: ["variable"],
		});

		const partial = state.draftText;
		const spaceIndex = partial.indexOf(" ");
		if (spaceIndex < 0) {
			setArgumentSuggestionsList([]);
			return;
		}

		const verb = partial.slice(0, spaceIndex);
		const argumentText = partial.slice(spaceIndex + 1);
		const parts = argumentText.split(/\s+/);
		const argIndex = Math.max(0, parts.length - 1);
		const prefix = parts[argIndex] ?? "";
		const priorArguments = parts.slice(0, argIndex);

		const descriptor = descriptors.find((candidate) =>
			[candidate.verb, ...candidate.aliases].some(
				(name) => name.toLocaleLowerCase() === verb.toLocaleLowerCase(),
			),
		);
		const argumentDescriptor = descriptor?.args?.[argIndex];

		if (!descriptor || !argumentDescriptor) {
			setArgumentSuggestionsList([]);
			return;
		}

		const blockInstanceId = state.cells[state.activeIndex]?.cellId;

		const context = {
			commandId: descriptor.commandId ?? descriptor.verb,
			commandVerb: descriptor.verb,
			argumentIndex: argIndex,
			argumentPrefix: prefix,
			priorArguments,
			allArguments: parts,
			sessionId: session.sessionId,
			blockInstanceId,
			argumentDescriptor,
		};

		globalRegistry
			.getSuggestions(context)
			.then((candidates) => {
				if (cancelled) return;
				const ranked = rankArgumentSuggestions(candidates, context);
				setArgumentSuggestionsList(ranked);
			})
			.catch(() => {
				if (!cancelled) setArgumentSuggestionsList([]);
			});

		return () => {
			cancelled = true;
		};
	}, [session, state.draftText, state.activeIndex, state.cells, state.mode]);

	useEffect(() => {
		let cancelled = false;
		if (!session || !isMacroAuthoring || !state.draftText) {
			setMacroSlots([]);
			setActiveDefinition(null);
			setChildDefinitions([]);
			return () => {
				cancelled = true;
			};
		}
		void session.v2.engine
			.getRuntime()
			.macros.authoring.inspectDraft(state.draftText, state.macroLocks)
			.then((inspection) => {
				if (cancelled) return;
				if (!inspection) {
					setMacroSlots([]);
					setActiveDefinition(null);
					setChildDefinitions([]);
					return;
				}
				setActiveDefinition(inspection.definition);
				setMacroSlots(inspection.slots);
				setChildDefinitions(inspection.childDefinitions);
				macroSessionRef.current?.dispatch({
					type: "inspection_resolved",
					definition: inspection.definition,
					childDefinitions: inspection.childDefinitions,
					slots: inspection.slots,
				});
			})
			.catch(() => {
				if (!cancelled) {
					setMacroSlots([]);
					setActiveDefinition(null);
					setChildDefinitions([]);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [session, state.mode, state.draftText, state.macroLocks]);

	useEffect(() => {
		let cancelled = false;
		if (!session || !isMacroAuthoring || !activeDefinition)
			return () => {
				cancelled = true;
			};

		const authoring = session.v2.engine.getRuntime().macros.authoring;
		void authoring
			.resolveExpressionLocks(
				state.draftText,
				activeDefinition,
				macroSlots,
				state.macroLocks,
			)
			.then((locks) => {
				if (cancelled) return;
				for (const lock of locks) {
					dispatch({ type: "add_macro_lock", lock });
				}
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
		};
	}, [
		session,
		state.mode,
		state.macroLocks,
		activeDefinition,
		macroSlots,
		state.draftText,
		dispatch,
	]);

	useEffect(() => {
		let cancelled = false;
		if (!session || !isMacroAuthoring || !activeDefinition) {
			setMacroDraftPreview(undefined);
			return () => {
				cancelled = true;
			};
		}
		const runtime = session.v2.engine.getRuntime();
		void runtime.macros.authoring
			.compileDraft(state.draftText, {
				groupId: `draft_${activeDefinition.macroId}`,
				profileId: session.v2.syntaxProfile.profileId,
				sessionId: session.sessionId,
				locks: state.macroLocks,
			})
			.then((preview) => {
				if (!cancelled) {
					setMacroDraftPreview(preview);
					macroSessionRef.current?.setExecutablePreview(preview);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		session,
		state.mode,
		state.draftText,
		activeDefinition,
		state.macroLocks,
	]);

	const commitMacro = useCallback(async () => {
		if (!session || !isMacroAuthoring) return;
		macroSessionRef.current?.dispatch({
			type: "set_text",
			text: state.draftText,
			cursorOffset: state.cursorOffset,
		});
		if (activeDefinition) {
			macroSessionRef.current?.dispatch({
				type: "inspection_resolved",
				definition: activeDefinition,
				childDefinitions,
				slots: macroSlots,
			});
		}
		macroSessionRef.current?.setExecutablePreview(macroDraftPreview);
		const finalized = macroSessionRef.current?.finalize();
		if (!finalized || !finalized.ok) {
			dispatch({
				type: "set_message",
				message:
					finalized?.diagnostics
						.map((diagnostic) => diagnostic.message)
						.join("; ") ?? "Macro is not ready",
			});
			return;
		}
		try {
			const cell = await session.v2.notebook.createCell({
				collection: {
					kind: "notebook",
					collectionId: session.sessionId,
				},
				rawText: finalized.authoredText,
				finalizedMacro: finalized,
			});
			dispatch({ type: "set_cells", cells: [...state.cells, cell] });
			dispatch({ type: "set_active", index: state.cells.length });
			dispatch({ type: "set_message", message: "Macro execution pending" });
			const result = await session.v2.notebook.executeFinalizedMacro(
				cell.cellId,
				`macro_${cell.cellId}_${finalized.fingerprint}`,
			);
			const updated = await session.v2.engine.getCell(cell.cellId);
			if (updated) dispatch({ type: "replace_cell", cell: updated });
			dispatch({
				type: "set_message",
				message:
					result.status === "committed"
						? "Macro committed"
						: result.diagnostics.join("; "),
			});
		} catch (error) {
			dispatch({
				type: "set_message",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}, [
		session,
		state.mode,
		state.cells,
		state.draftText,
		state.cursorOffset,
		activeDefinition,
		childDefinitions,
		macroSlots,
		macroDraftPreview,
	]);

	const reverseActiveMacro = useCallback(async () => {
		if (!session) return;
		const cell = state.cells[state.activeIndex];
		if (!cell?.authored.finalizedMacro) return;
		try {
			const result = await session.v2.notebook.reverseFinalizedMacro(
				cell.cellId,
				`reverse_${cell.cellId}_${cell.execution.transactionId ?? "unknown"}`,
			);
			const updated = await session.v2.engine.getCell(cell.cellId);
			if (updated) dispatch({ type: "replace_cell", cell: updated });
			dispatch({
				type: "set_message",
				message:
					result.status === "committed"
						? "Macro reversed"
						: result.diagnostics.join("; "),
			});
		} catch (error) {
			dispatch({
				type: "set_message",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}, [session, state.activeIndex, state.cells]);

	const unlockActiveMacroSlot = useCallback(() => {
		const active = activeMacroSlot(macroSlots, state.cursorOffset);
		if (!active) return;
		dispatch({
			type: "remove_macro_lock",
			lock: {
				argumentId: active.argumentId,
				macroId: active.macroId,
				macroVersion: active.macroVersion,
				start: active.start,
				end: active.end,
				rawText: active.rawText,
				source: "explicit",
			},
		});
	}, [macroSlots, state.cursorOffset, dispatch]);

	const lockActiveMacroSlot = useCallback(() => {
		const active = activeMacroSlot(macroSlots, state.cursorOffset);
		if (!active) return;
		dispatch({
			type: "add_macro_lock",
			lock: createExplicitMacroLock(active),
		});
	}, [macroSlots, state.cursorOffset, dispatch]);

	useEffect(() => {
		let cancelled = false;
		if (!session) {
			setCommandHistoryCandidates([]);
			return () => {
				cancelled = true;
			};
		}
		void session.v2.commandHistoryStore
			.query({ sessionId: session.sessionId, scope: "merged", limit: 50 })
			.then((candidates) => {
				if (!cancelled) setCommandHistoryCandidates(candidates);
			})
			.catch(() => {
				if (!cancelled) setCommandHistoryCandidates([]);
			});
		return () => {
			cancelled = true;
		};
	}, [session, state.commandHistory]);

	const loadSnapshot = useCallback(async () => {
		if (!session) return;
		dispatch({ type: "set_loading", loading: true });
		try {
			const snapshot = await session.v2.notebook.loadEditorSnapshot();
			const activeIndex = snapshot.activeCellId
				? snapshot.cells.findIndex(
						(cell) => cell.cellId === snapshot.activeCellId,
					)
				: -1;
			dispatch({
				type: "hydrate_snapshot",
				cells: snapshot.cells,
				activeIndex: activeIndex >= 0 ? activeIndex : 0,
				draftText: snapshot.record.draftText ?? "",
				commandHistory: snapshot.record.commandHistory,
				mode: snapshot.record.editorMode ?? "NORMAL",
			});
			if (snapshot.diagnostics.length > 0) {
				const messages = snapshot.diagnostics.map((d) => d.reason).join("; ");
				dispatch({
					type: "set_message",
					message: `Cell load warnings: ${messages}`,
				});
			}
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

	const refreshSnapshot = useCallback(async () => {
		if (!session) return;
		try {
			const snapshot = await session.v2.notebook.loadEditorSnapshot();
			const activeIndex = snapshot.activeCellId
				? snapshot.cells.findIndex(
						(cell) => cell.cellId === snapshot.activeCellId,
					)
				: -1;
			dispatch({
				type: "hydrate_snapshot",
				cells: snapshot.cells,
				activeIndex: activeIndex >= 0 ? activeIndex : 0,
				draftText:
					state.mode === "INSERT"
						? state.draftText
						: (snapshot.record.draftText ?? ""),
				commandHistory: snapshot.record.commandHistory,
				mode: snapshot.record.editorMode ?? "NORMAL",
			});
		} catch {
			// refresh failures are non-fatal; the editor retains its current state
		}
	}, [session, state]);

	const commitEditorDraft = useCallback(async () => {
		if (!session) return;
		const editingCellId = editingCellIdRef.current;
		if (!editingCellId) return;
		const cell = state.cells.find((c) => c.cellId === editingCellId);
		if (!cell) return;
		if (cell.lifecycle.status === "committed") return;
		if (state.draftText === cell.authored.rawText) return;
		try {
			const updated = await session.v2.notebook.editCell({
				cellId: editingCellId,
				rawText: state.draftText,
				expectedRevision: editingRevisionRef.current,
			});
			dispatch({ type: "replace_cell", cell: updated });
			editingCellIdRef.current = null;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("revision mismatch")
			) {
				await refreshSnapshot();
			} else {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}, [session, state.cells, state.draftText, refreshSnapshot]);

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
			if (cell.authored.finalizedMacro) {
				dispatch({
					type: "set_message",
					message:
						"Finalized Macro plans are already previewed in the authoring panel",
				});
				return;
			}
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
			if (line.trim() === ":history") {
				options.onOpenHistory?.();
				dispatch({ type: "set_mode", mode: "NORMAL" });
				dispatch({ type: "set_command", text: "" });
				return { success: true, message: "history opened" };
			}
			const snapshot = await session.v2.notebook.loadEditorSnapshot();
			const result = await session.v2.commandBar.execute({
				rawText: line,
				sessionId: session.sessionId,
				workspaceId: snapshot.record.workspaceId,
				documentId: snapshot.record.documentId,
				cellId: snapshot.activeCellId,
			});
			const variable = result.variable;
			const message = variable
				? variable.operation === "assert"
					? "assert passed"
					: variable.operation === "remove"
						? `removed ${variable.name ?? ""}`.trim()
						: variable.operation === "eval"
							? (variable.serialized ?? "undefined")
							: `${variable.operation} ${variable.name ?? ""} = ${variable.serialized ?? "undefined"}`.trim()
				: result.status === "committed"
					? "V2 command committed"
					: (result.error ?? "V2 command failed");
			if (result.status === "committed") {
				const normalizedLine = line.trim();
				const canonicalVerb = normalizedLine
					.replace(/^[:^]/, "")
					.split(/\s+/, 1)[0];
				const commandHistory = [
					normalizedLine,
					...state.commandHistory.filter((entry) => entry !== normalizedLine),
				].slice(0, 50);
				dispatch({ type: "set_command_history", history: commandHistory });
				const spaceIdx = normalizedLine.indexOf(" ");
				const args =
					spaceIdx >= 0
						? normalizedLine
								.slice(spaceIdx + 1)
								.trim()
								.split(/\s+/)
								.filter(Boolean)
								.map((part, index) => ({
									index,
									value: part,
								}))
						: [];
				await session.v2.commandHistoryStore.recordSuccess({
					sessionId: session.sessionId,
					commandText: normalizedLine,
					canonicalVerb,
					commandId: canonicalVerb
						? `editor.command.${canonicalVerb}`
						: undefined,
					args,
				});
			}
			dispatch({ type: "set_mode", mode: "NORMAL" });
			dispatch({ type: "set_command", text: "" });
			dispatch({ type: "set_message", message });
			return { success: result.status === "committed", message, data: result };
		},
		[options, session, state.commandHistory],
	);

	const getAutocomplete = useCallback(
		(partial: string): AutocompleteSuggestion[] => {
			if (!session) return [];
			const profile = session.v2.syntaxProfile;
			const token = isMacroAuthoring
				? profile.macroStartToken
				: profile.directCommandToken;
			// Build canonical CommandDescriptors from the active syntax profile.
			// In MACRO mode, only macro names are suggested (V1 parity).
			const descriptors = buildCommandDescriptors(profile, {
				variableName: isMacroAuthoring
					? undefined
					: profile.variableCommandName,
				variableAliases: isMacroAuthoring ? undefined : ["variable"],
			});
			if (partial.includes(" ")) {
				if (argumentSuggestionsList.length > 0) return argumentSuggestionsList;
				const staticArgs = argumentSuggestions(partial, descriptors);
				if (staticArgs.length > 0) return staticArgs;
			}
			const staticSuggestions = dedupeCanonicalSuggestions(
				descriptors,
				partial,
				token,
				isMacroAuthoring ? "macro" : "editor",
				isMacroAuthoring ? "macro" : "v2",
			);
			if (isMacroAuthoring) return staticSuggestions;
			const learnedSuggestions = historySuggestions(
				commandHistoryCandidates,
				partial,
				token,
			);
			return [...learnedSuggestions, ...staticSuggestions]
				.filter(
					(suggestion, index, all) =>
						all.findIndex(
							(candidate) => candidate.value === suggestion.value,
						) === index,
				)
				.slice(0, 12);
		},
		[
			commandHistoryCandidates,
			argumentSuggestionsList,
			session,
			state.mode,
			state.commandKind,
		],
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
		macroDraftPreview,
		macroSlots,
		macroLocks: state.macroLocks,
		activeDefinition,
		unlockActiveMacroSlot,
		lockActiveMacroSlot,
		refreshSnapshot,
		commitEditorDraft,
		commitMacro,
		reverseActiveMacro,
		setEditingCell: (cellId) => {
			editingCellIdRef.current = cellId;
			const cell = state.cells.find((c) => c.cellId === cellId);
			if (cell) editingRevisionRef.current = cell.lifecycle.revision;
		},
		supersedeActiveCell: async () => {
			if (!session) return null;
			const cell = state.cells[state.activeIndex];
			if (!cell || cell.lifecycle.status !== "committed") return null;
			try {
				const superseded = await session.v2.notebook.supersedeCell(
					cell.cellId,
					cell.authored.rawText,
					cell.lifecycle.revision,
				);
				return superseded;
			} catch (error) {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
				return null;
			}
		},
		cancelActive: async () => {
			if (!session) return false;
			const cell = state.cells[state.activeIndex];
			if (!cell) return false;
			if (
				cell.lifecycle.status === "committed" ||
				cell.lifecycle.status === "deleted" ||
				cell.lifecycle.status === "cancelled"
			) {
				dispatch({
					type: "set_message",
					message: `Cell ${cell.cellId} is not eligible for cancellation`,
				});
				return false;
			}
			try {
				const updated = await session.v2.notebook.cancelCell(
					cell.cellId,
					cell.lifecycle.revision,
				);
				dispatch({ type: "replace_cell", cell: updated });
				dispatch({
					type: "set_message",
					message: `Cell ${cell.cellId} cancelled`,
				});
				return true;
			} catch (error) {
				dispatch({
					type: "set_message",
					message: error instanceof Error ? error.message : String(error),
				});
				return false;
			}
		},
		moveActive: async (delta) => {
			if (!session) return;
			const cell = state.cells[state.activeIndex];
			if (!cell) return;
			if (cell.authored.finalizedMacro) {
				dispatch({
					type: "set_message",
					message: "Finalized Macro history cannot reorder cells",
				});
				return;
			}
			const currentIndex = state.cells.indexOf(cell);
			const targetIndex = currentIndex + delta;
			if (targetIndex < 0 || targetIndex >= state.cells.length) return;
			await session.v2.notebook.moveCells([cell.cellId], targetIndex);
			dispatch({
				type: "move_cell",
				cellId: cell.cellId,
				targetIndex,
			});
		},
		moveSelection: async (delta) => {
			if (!session) return;
			const active = state.cells[state.activeIndex];
			if (active?.authored.finalizedMacro) {
				dispatch({
					type: "set_message",
					message: "Finalized Macro history cannot reorder cells",
				});
				return;
			}
			const lo = Math.min(state.visualStart, state.visualEnd);
			const hi = Math.max(state.visualStart, state.visualEnd);
			const selected = state.cells.slice(lo, hi + 1);
			if (selected.length === 0) return;
			const cellIds = selected.map((c) => c.cellId);
			const firstIndex = state.cells.indexOf(selected[0]!);
			const targetIndex = firstIndex + delta;
			if (targetIndex < 0 || targetIndex >= state.cells.length) return;
			await session.v2.notebook.moveCells(cellIds, targetIndex);
			dispatch({
				type: "move_cell",
				cellId: cellIds[0]!,
				targetIndex,
			});
		},
		childDefinitions,
		macroSession: macroSessionRef.current,
	};
}
