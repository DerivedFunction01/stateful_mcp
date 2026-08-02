import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import { Box, Text, useInput } from "ink";
import type { Dispatch } from "react";
import {
	type CommandCatalog,
	currentCommandLine,
	type EditorAction,
	type EditorContext,
	type EditorKernelState,
	replaceCurrentLine,
	type SubmissionPort,
} from "../lib/cell-editor";
import { reduceCompletion } from "../lib/completion-state";
import { CommandBar } from "./CommandBar";

interface CellEditorProps {
	state: EditorKernelState;
	dispatch: Dispatch<EditorAction>;
	context: EditorContext;
	catalog: CommandCatalog;
	submission?: SubmissionPort;
	onClose: () => void;
	onShowHelp: () => void;
	onUiCommand?: (commandLine: string) => Promise<boolean>;
}

function selectedSuggestion(
	state: EditorKernelState,
): AutocompleteSuggestion | null {
	return state.completion.status === "cycling"
		? (state.completion.candidates[state.completion.highlightIndex] ?? null)
		: null;
}

export function CellEditor({
	state,
	dispatch,
	context,
	catalog,
	submission,
	onClose,
	onShowHelp,
	onUiCommand,
}: CellEditorProps) {
	const commandLine = currentCommandLine(state.draftText);
	const suggestions = commandLine
		? catalog.getSuggestions(commandLine.slice(1), context)
		: [];
	const highlightedCandidate = selectedSuggestion(state);
	const completionPrefix =
		state.completion.status === "cycling"
			? state.completion.session.prefix
			: commandLine.slice(1);

	useInput(async (_input, key) => {
		if (state.showHelp) return;

		if (key.escape) {
			if (state.mode !== "NORMAL" || state.draftText) {
				dispatch({ type: "CANCEL" });
			} else {
				onClose();
			}
			return;
		}

		if (state.mode === "NORMAL") {
			if (_input === "i" || _input === "a") {
				dispatch({ type: "ENTER_INSERT" });
			} else if (_input === ":") {
				dispatch({ type: "ENTER_COMMAND" });
			} else if (_input === "?") {
				onShowHelp();
			}
			return;
		}

		if (key.tab || key.upArrow || key.downArrow) {
			const transition = reduceCompletion(
				state.completion,
				key.tab
					? { kind: "tab", shift: Boolean(key.shift) }
					: { kind: key.upArrow ? "up" : "down" },
				commandLine,
				(partial) => catalog.getSuggestions(partial, context),
			);
			dispatch({
				type: "SET_COMPLETION",
				completion: transition.completionState,
			});
			return;
		}

		if (key.return) {
			if (state.mode === "INSERT" && !key.ctrl && !key.meta) {
				dispatch({ type: "NEWLINE" });
				return;
			}

			const transition = reduceCompletion(
				state.completion,
				{ kind: "enter" },
				commandLine || state.draftText,
				(partial) => catalog.getSuggestions(partial, context),
			);
			const submittedText =
				transition.executeLine && commandLine
					? replaceCurrentLine(state.draftText, transition.executeLine)
					: state.draftText;
			if (onUiCommand && (await onUiCommand(submittedText.trim()))) {
				dispatch({ type: "CANCEL" });
				return;
			}
			dispatch({
				type: "SET_COMPLETION",
				completion: transition.completionState,
			});
			if (submission && submittedText.trim()) {
				void submission.submit(
					submission.plan(submittedText, context),
					context,
				);
				dispatch({ type: "CANCEL" });
			}
			return;
		}

		if (key.backspace) {
			dispatch({ type: "BACKSPACE" });
			return;
		}

		if (state.mode === "INSERT" && key.ctrl && _input === "") {
			if (submission && state.draftText.trim()) {
				void submission.submit(
					submission.plan(state.draftText, context),
					context,
				);
				dispatch({ type: "CANCEL" });
			}
			return;
		}

		if (_input.length === 1 && !key.ctrl && !key.meta) {
			dispatch({ type: "INSERT_TEXT", text: _input });
		}
	});

	return (
		<Box flexDirection="column" width="100%">
			<Box
				borderStyle="single"
				borderColor="cyan"
				paddingLeft={1}
				paddingRight={1}
			>
				<Text>
					{state.draftText
						? `> ${state.draftText}`
						: `> ${state.mode === "NORMAL" ? "i/a to edit" : "type workspace input"}`}
				</Text>
			</Box>
			{commandLine && (
				<CommandBar
					commandLine={commandLine}
					suggestions={suggestions}
					suggestionIndex={
						state.completion.status === "cycling"
							? state.completion.highlightIndex
							: -1
					}
					highlightedCandidate={highlightedCandidate}
					completionPrefix={completionPrefix}
				/>
			)}
			{state.error && <Text color="red">{state.error}</Text>}
		</Box>
	);
}
