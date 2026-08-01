import { useApp, useInput } from "ink";
import { Notebook } from "./components/Notebook";
import { PreviewScreen } from "./components/PreviewScreen";
import { useNotebook } from "./hooks/useNotebook";
import { useSession } from "./hooks/useSession";
import { resolveKey } from "./lib/keymap";
import { EditorAction } from "@stateful-mcp/clinical/session/editor-action";
import { useCallback, useState } from "react";

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
	} = useNotebook(session);
	const { exit } = useApp();
	const [pendingSequence, setPendingSequence] = useState("");

	const handleInput = useCallback(
		(
			input: string,
			key: {
				upArrow?: boolean;
				downArrow?: boolean;
				escape?: boolean;
				return?: boolean;
				backspace?: boolean;
				ctrl?: boolean;
				meta?: boolean;
			},
		) => {
			// When preview is active, preview screen owns input
			if (state.preview) return;

			const result = resolveKey(
				input,
				key as any,
				state.mode,
				pendingSequence,
			);
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
					if (result.char) {
						dispatch({ type: "TYPE_CHAR", char: result.char });
					}
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
						dispatch({
							type: "UPDATE_CELL",
							cellId: cell.cellId,
							updater: (c) => ({ ...c, status: "parsing" as const }),
						});
						runCell(cell);
					}
					break;
				}
				case EditorAction.PreviewCell: {
					const cell = state.cells[state.activeIndex];
					if (cell && session) {
						previewCell(cell);
					}
					break;
				}
				case EditorAction.Quit:
					exit();
					break;
			}
		},
		[
			state,
			session,
			pendingSequence,
			dispatch,
			insertBelow,
			insertAbove,
			runCell,
			previewCell,
			exit,
		],
	);

	useInput(handleInput);

	if (!session) {
		return <Notebook state={state} sessionId="loading..." />;
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
					const cell = state.cells.find(
						(c) => c.cellId === candidate.cellId,
					);
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
		<Notebook state={state} sessionId={session.sessionId} />
	);
}