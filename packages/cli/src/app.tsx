import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { useApp, useInput } from "ink";
import { useCallback, useMemo, useRef, useState } from "react";
import { Notebook } from "./components/Notebook";
import { PreviewScreen } from "./components/PreviewScreen";
import { useNotebook } from "./hooks/useNotebook";
import { useSession } from "./hooks/useSession";
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
	} = useNotebook(session);
	const { exit } = useApp();
	const [pendingSequence, setPendingSequence] = useState("");
	const [suggestionIndex, setSuggestionIndex] = useState(-1);

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

	const handleInput = useCallback(
		(input: string, key: { upArrow?: boolean; downArrow?: boolean; escape?: boolean; return?: boolean; backspace?: boolean; tab?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean }) => {
			if (state.preview) return;

			if (state.mode === "COMMAND") {
				if (key.escape) {
					dispatch({ type: "EXIT_COMMAND_MODE" });
					setSuggestionIndex(-1);
					return;
				}
				if (key.return) {
					dispatchCommand(state.commandLine).then((result) => {
						if (result.action === "quit") { exit(); return; }
						if (result.action === "show_help") { dispatch({ type: "TOGGLE_HELP" }); return; }
						if (result.action === "show_errors") { dispatch({ type: "SET_MESSAGE", message: "errors view" }); return; }
						if (result.action === "undo") { dispatch({ type: "UNDO" }); return; }
						if (result.action === "redo") { dispatch({ type: "REDO" }); return; }
						if (result.action === "set_execution_mode") {
							const mode = (result as any).data?.mode;
							if (mode === "preview" || mode === "execute") {
								dispatch({ type: "SET_SESSION_MODE", mode });
							}
							return;
						}
						if (result.action === "save") { dispatch({ type: "SET_MESSAGE", message: "saved" }); return; }
						if (!result.success && result.message) {
							dispatch({ type: "SET_MESSAGE", message: result.message });
						}
					});
					setSuggestionIndex(-1);
					return;
				}
				if (key.upArrow) {
					dispatch({ type: "COMMAND_HISTORY_PREV" });
					setSuggestionIndex(-1);
					return;
				}
				if (key.downArrow) {
					dispatch({ type: "COMMAND_HISTORY_NEXT" });
					setSuggestionIndex(-1);
					return;
				}
				if (key.shift && key.tab) {
					const partial = state.commandLine.slice(1);
					const suggestions = getAutocomplete(partial);
					if (suggestions.length === 0) return;
					const nextIdx = ((suggestionIndex - 1 + suggestions.length) % suggestions.length + suggestions.length) % suggestions.length;
					const fill = suggestions[nextIdx]!.verb.slice(partial.length);
					dispatch({ type: "COMMAND_APPEND", char: fill });
					setSuggestionIndex(nextIdx);
					return;
				}
				if (key.tab) {
					const partial = state.commandLine.slice(1);
					const suggestions = getAutocomplete(partial);
					if (suggestions.length === 0) return;
					const nextIdx = ((suggestionIndex + 1) % suggestions.length + suggestions.length) % suggestions.length;
					const fill = suggestions[nextIdx]!.verb.slice(partial.length);
					dispatch({ type: "COMMAND_APPEND", char: fill });
					setSuggestionIndex(nextIdx);
					return;
				}
				if (key.backspace) {
					dispatch({ type: "COMMAND_BACKSPACE" });
					setSuggestionIndex(-1);
					return;
				}
				if (input.length === 1 && !key.ctrl && !key.meta) {
					dispatch({ type: "COMMAND_APPEND", char: input });
					setSuggestionIndex(-1);
					return;
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
					const cell = state.cells[state.activeIndex];
					if (!cell || !session) break;
					if (state.sessionMode === "preview") {
						previewCell(cell);
					} else {
						dispatch({ type: "UPDATE_CELL", cellId: cell.cellId, updater: (c) => ({ ...c, status: "parsing" as const }) });
						runCell(cell);
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
					if (next !== null) dispatch({ type: "SET_ACTIVE_INDEX", index: next });
					break;
				}
				case EditorAction.PrevError: {
					const prev = prevErrorIndex();
					if (prev !== null) dispatch({ type: "SET_ACTIVE_INDEX", index: prev });
					break;
				}
				case EditorAction.OpenCommandLine:
					dispatch({ type: "ENTER_COMMAND_MODE" });
					setSuggestionIndex(-1);
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
			}
		},
		[state, session, pendingSequence, suggestionIndex, dispatch, insertBelow, insertAbove, runCell, previewCell, dispatchCommand, nextErrorIndex, prevErrorIndex, getAutocomplete, exit],
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
						dispatch({ type: "UPDATE_CELL", cellId: cell.cellId, updater: (c) => ({ ...c, status: "draft" as const }) });
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
		/>
	);
}