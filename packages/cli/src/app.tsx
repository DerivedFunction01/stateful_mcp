import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { useApp, useInput } from "ink";
import { useCallback, useMemo, useRef, useState } from "react";
import { Notebook } from "./components/Notebook";
import { PreviewScreen } from "./components/PreviewScreen";
import { useNotebook } from "./hooks/useNotebook";
import { useSession } from "./hooks/useSession";
import {
	type CompletionKey,
	type CompletionState,
	reduceCompletion,
} from "./lib/completion-state";
import { resolveKey } from "./lib/keymap";

export function NotebookApp() {
	const session = useSession();
	const {
		state,
		dispatch,
		insertBelow,
		insertAbove,
		runCell,
		previewCell,
		acceptPreview,
		setSessionMode,
		dispatchCommand,
		nextErrorIndex,
		prevErrorIndex,
		getAutocomplete,
		cellSuggestions,
	} = useNotebook(session);
	const { exit } = useApp();
	const [pendingSequence, setPendingSequence] = useState("");
	const [completionState, setCompletionState] = useState<CompletionState>({
		status: "idle",
	});

	const submittingRef = useRef(false);
	const editorRegistryRef = useRef(EditorCommandRegistry.createDefault());

	const cellDescriptors = useMemo(() => {
		if (!session) return [];
		const registry = (session.result.processor as any).cellCommandRegistry;
		return registry?.getDescriptors?.() ?? [];
	}, [session]);

	const editorDescriptors = useMemo(
		() => editorRegistryRef.current.getDescriptors(),
		[],
	);

	const workspaceCommandMappings = useMemo(
		() =>
			session?.result.engine.getParser().getProfile()
				.workspaceCommandMappings ?? {},
		[session],
	);

	const handleInput = useCallback(
		(
			input: string,
			key: {
				upArrow?: boolean;
				downArrow?: boolean;
				escape?: boolean;
				return?: boolean;
				backspace?: boolean;
				tab?: boolean;
				shift?: boolean;
				ctrl?: boolean;
				meta?: boolean;
			},
		) => {
			if (state.preview) return;

			if (state.mode === "COMMAND") {
				// D4: ignore all keys while a dispatch is pending.
				if (submittingRef.current) return;

				if (key.escape) {
					dispatch({ type: "EXIT_COMMAND_MODE" });
					setCompletionState({ status: "idle" });
					return;
				}
				if (key.return) {
					// D5: pure transition — commit + execute in one.
					const transition = reduceCompletion(
						completionState,
						{ kind: "enter" },
						state.commandLine,
						getAutocomplete,
					);
					setCompletionState(transition.completionState);
					const line = transition.executeLine ?? state.commandLine;
					submittingRef.current = true;
					dispatchCommand(line)
						.then((result) => {
							if (result.action === "quit") {
								exit();
								return;
							}
							if (result.action === "show_help") {
								dispatch({ type: "TOGGLE_HELP" });
								return;
							}
							if (result.action === "show_info") {
								dispatch({
									type: "TOGGLE_CELL_INFO",
									cellIndex: state.activeIndex,
								});
								return;
							}
							if (result.action === "render_preview") {
								dispatch({ type: "SET_MESSAGE", message: "rendered view" });
								return;
							}
							if (result.action === "show_errors") {
								dispatch({ type: "SET_MESSAGE", message: "errors view" });
								return;
							}
							if (result.action === "undo") {
								dispatch({ type: "UNDO" });
								return;
							}
							if (result.action === "redo") {
								dispatch({ type: "REDO" });
								return;
							}
							if (result.action === "set_execution_mode") {
								const mode = (result as any).data?.mode;
								if (mode === "preview" || mode === "execute") {
									dispatch({ type: "SET_SESSION_MODE", mode });
								}
								return;
							}
							if (result.action === "set_default_insert") {
								const data = (result as any).data;
								if (data) {
									dispatch({
										type: "SET_DEFAULT_INSERT",
										section: data.section,
										schema: data.schema ?? null,
									});
									dispatch({
										type: "SET_MESSAGE",
										message: `default insert: ${data.section}${data.schema ? ` / ${data.schema}` : ""}`,
									});
								}
								return;
							}
							if (result.action === "save") {
								dispatch({ type: "SET_MESSAGE", message: "saved" });
								return;
							}
							if (!result.success && result.message) {
								dispatch({ type: "SET_MESSAGE", message: result.message });
							}
						})
						.finally(() => {
							submittingRef.current = false;
						});
					return;
				}
				let completionKey: CompletionKey | null = null;
				if (key.upArrow) completionKey = { kind: "up" };
				else if (key.downArrow) completionKey = { kind: "down" };
				else if (key.shift && key.tab)
					completionKey = { kind: "tab", shift: true };
				else if (key.tab) completionKey = { kind: "tab", shift: false };
				else if (input === " ") completionKey = { kind: "space" };
				else if (key.backspace) completionKey = { kind: "backspace" };
				else if (input.length === 1 && !key.ctrl && !key.meta)
					completionKey = { kind: "char", char: input };

				if (!completionKey) return;

				const transition = reduceCompletion(
					completionState,
					completionKey,
					state.commandLine,
					getAutocomplete,
				);
				setCompletionState(transition.completionState);

				if (transition.shouldAppend) {
					dispatch({ type: "COMMAND_APPEND", char: transition.shouldAppend });
				}
				if (transition.committedLine) {
					dispatch({
						type: "COMMAND_SET",
						text: transition.committedLine,
					});
				}
				if (transition.historyMove === "prev") {
					dispatch({ type: "COMMAND_HISTORY_PREV" });
				}
				if (transition.historyMove === "next") {
					dispatch({ type: "COMMAND_HISTORY_NEXT" });
				}
				if (transition.backspace) {
					dispatch({ type: "COMMAND_BACKSPACE" });
				}
				return;
			}

			const result = resolveKey(input, key as any, state.mode, pendingSequence);
			setPendingSequence(result.nextPending);

			if (result.action === null) return;

			switch (result.action) {
				case EditorAction.MoveDown:
					dispatch({ type: "MOVE_CURSOR", delta: 1 });
					break;
				case EditorAction.MoveUp:
					dispatch({ type: "MOVE_CURSOR", delta: -1 });
					break;
				case EditorAction.EnterInsertMode:
					dispatch({ type: "ENTER_INSERT_MODE" });
					break;
				case EditorAction.ExitInsertMode:
					dispatch({ type: "EXIT_INSERT_MODE" });
					break;
				case EditorAction.TypeChar:
					if (result.char) dispatch({ type: "TYPE_CHAR", char: result.char });
					break;
				case EditorAction.Backspace:
					dispatch({ type: "BACKSPACE" });
					break;
				case EditorAction.CommitCell:
					dispatch({ type: "COMMIT_CELL" });
					break;
				case EditorAction.InsertBelow:
					if (session) insertBelow(session.sessionId);
					break;
				case EditorAction.InsertAbove:
					if (session) insertAbove(session.sessionId);
					break;
				case EditorAction.DeleteCell:
					dispatch({ type: "DELETE_ACTIVE_CELL" });
					break;
				case EditorAction.RunCell: {
					if (state.mode === "VISUAL") {
						const lo = Math.min(state.visualStart, state.visualEnd);
						const hi = Math.max(state.visualStart, state.visualEnd);
						for (let i = lo; i <= hi; i++) {
							const cell = state.cells[i];
							if (cell && session) {
								if (state.sessionMode === "preview") {
									previewCell(cell);
								} else {
									dispatch({
										type: "UPDATE_CELL",
										cellId: cell.cellId,
										updater: (c) => ({ ...c, status: "parsing" as const }),
									});
									runCell(cell);
								}
							}
						}
					} else {
						const cell = state.cells[state.activeIndex];
						if (!cell || !session) break;
						if (state.sessionMode === "preview") {
							previewCell(cell);
						} else {
							dispatch({
								type: "UPDATE_CELL",
								cellId: cell.cellId,
								updater: (c) => ({ ...c, status: "parsing" as const }),
							});
							runCell(cell);
						}
					}
					break;
				}
				case EditorAction.PreviewCell: {
					const cell = state.cells[state.activeIndex];
					if (cell && session) previewCell(cell);
					break;
				}
				case EditorAction.Undo:
					dispatch({ type: "UNDO" });
					break;
				case EditorAction.Redo:
					dispatch({ type: "REDO" });
					break;
				case EditorAction.YankCell:
					dispatch({ type: "YANK_CELL" });
					break;
				case EditorAction.PasteCell:
					dispatch({ type: "PASTE_CELL" });
					break;
				case EditorAction.NextError: {
					const next = nextErrorIndex();
					if (next !== null)
						dispatch({ type: "SET_ACTIVE_INDEX", index: next });
					break;
				}
				case EditorAction.PrevError: {
					const prev = prevErrorIndex();
					if (prev !== null)
						dispatch({ type: "SET_ACTIVE_INDEX", index: prev });
					break;
				}
				case EditorAction.OpenCommandLine:
					dispatch({ type: "ENTER_COMMAND_MODE" });
					setCompletionState({ status: "idle" });
					break;
				case EditorAction.EnterVisualMode:
					dispatch({ type: "ENTER_VISUAL_MODE" });
					break;
				case EditorAction.ExtendSelectionDown:
					dispatch({ type: "EXTEND_SELECTION", delta: 1 });
					break;
				case EditorAction.ExtendSelectionUp:
					dispatch({ type: "EXTEND_SELECTION", delta: -1 });
					break;
				case EditorAction.SwapSelectionAnchor:
					dispatch({ type: "SWAP_SELECTION_ANCHOR" });
					break;
				case EditorAction.DeleteSelection:
					dispatch({ type: "DELETE_SELECTION" });
					break;
				case EditorAction.YankSelection:
					dispatch({ type: "YANK_SELECTION" });
					break;
				case EditorAction.Quit:
					exit();
					break;
				case EditorAction.Info: {
					const cell = state.cells[state.activeIndex];
					if (cell)
						dispatch({
							type: "TOGGLE_CELL_INFO",
							cellIndex: state.activeIndex,
						});
					break;
				}
			}
		},
		[
			state,
			session,
			pendingSequence,
			completionState,
			dispatch,
			insertBelow,
			insertAbove,
			runCell,
			previewCell,
			dispatchCommand,
			nextErrorIndex,
			prevErrorIndex,
			getAutocomplete,
			exit,
		],
	);

	useInput(handleInput);

	if (!session) {
		return (
			<Notebook
				state={state}
				sessionId="loading..."
				editorDescriptors={[]}
				cellDescriptors={[]}
				getAutocomplete={() => []}
				cellSuggestions={[]}
				completionState={{ status: "idle" }}
				onCloseHelp={() => dispatch({ type: "TOGGLE_HELP" })}
				onCloseWorkspace={() => dispatch({ type: "TOGGLE_WORKSPACE" })}
				workspaceCommandMappings={{}}
			/>
		);
	}

	if (state.preview) {
		const candidate = state.preview;
		return (
			<PreviewScreen
				candidate={candidate}
				onAccept={() => acceptPreview(candidate)}
				onEdit={() => {
					dispatch({ type: "CLEAR_PREVIEW" });
					dispatch({ type: "ENTER_INSERT_MODE" });
				}}
				onCancel={() => {
					const cell = state.cells.find((c) => c.cellId === candidate.cellId);
					if (cell) {
						dispatch({
							type: "UPDATE_CELL",
							cellId: cell.cellId,
							updater: (c) => ({ ...c, status: "draft" as const }),
						});
					}
					dispatch({ type: "CLEAR_PREVIEW" });
				}}
			/>
		);
	}

	return (
		<Notebook
			state={state}
			sessionId={session.sessionId}
			editorDescriptors={editorDescriptors}
			cellDescriptors={cellDescriptors}
			getAutocomplete={getAutocomplete}
			cellSuggestions={cellSuggestions}
			completionState={completionState}
			onCloseHelp={() => dispatch({ type: "TOGGLE_HELP" })}
			onCloseWorkspace={() => dispatch({ type: "TOGGLE_WORKSPACE" })}
			workspaceCommandMappings={workspaceCommandMappings}
		/>
	);
}
