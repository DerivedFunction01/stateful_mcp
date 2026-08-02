import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { NotebookState } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { Box } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import type { SessionState } from "../hooks/useSession";
import { useWorkspace } from "../hooks/useWorkspace";
import type { CompletionState } from "../lib/completion-state";
import { CellInfoPanel } from "./CellInfoPanel";
import { CellList } from "./CellList";
import { CommandBar } from "./CommandBar";
import { HelpBar } from "./HelpBar";
import { HelpScreen } from "./HelpScreen";
import { StatusBar } from "./StatusBar";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { WorkspaceStrip } from "./WorkspaceStrip";

interface NotebookProps {
	state: NotebookState;
	sessionId: string;
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	getAutocomplete: (partial: string) => AutocompleteSuggestion[];
	cellSuggestions: CellSuggestion[];
	completionState: CompletionState;
	onCloseHelp: () => void;
	/** Shared session; required to avoid a second useSession() bootstrap. */
	session: SessionState | null;
	onCloseWorkspace: () => void;
}

export function Notebook({
	state,
	sessionId,
	editorDescriptors,
	cellDescriptors,
	getAutocomplete,
	cellSuggestions,
	completionState,
	onCloseHelp,
	onCloseWorkspace,
	session,
}: NotebookProps) {
	const workspace = useWorkspace({
		showWorkspace: state.showWorkspace,
		sessionId,
		soapNoteId: sessionId,
		session,
	});

	if (state.showHelp) {
		return (
			<HelpScreen
				editorDescriptors={editorDescriptors}
				cellDescriptors={cellDescriptors}
				onClose={onCloseHelp}
			/>
		);
	}

	if (state.showCellInfo) {
		const cell = state.cells[state.cellInfoIndex];
		if (!cell) return null;
		return <CellInfoPanel cell={cell} onClose={() => {}} />;
	}

	if (state.showWorkspace) {
		return (
			<WorkspaceScreen
				snapshot={workspace.snapshot}
				sessionId={sessionId}
				loading={workspace.loading}
				error={workspace.error}
				focused={workspace.focused}
				onClose={onCloseWorkspace}
				planSubmission={workspace.planSubmission}
				onSubmitPlan={workspace.submitPlan}
				commandCatalog={workspace.commandCatalog}
				onFocusBranch={workspace.focusBranch}
			/>
		);
	}

	if (state.mode === "COMMAND") {
		const suggestions = getAutocomplete(state.commandLine.slice(1));
		const highlightedCandidate =
			completionState.status === "cycling"
				? (completionState.candidates[completionState.highlightIndex] ?? null)
				: null;
		const completionPrefix =
			completionState.status === "cycling"
				? completionState.session.prefix
				: state.commandLine.slice(1);
		return (
			<Box flexDirection="column" width="100%" height="100%">
				<WorkspaceStrip snapshot={workspace.snapshot} />
				<CellList
					cells={state.cells}
					activeIndex={state.activeIndex}
					mode={state.mode}
					draftText={state.draftText}
					lastEditCellId={state.lastEditCellId}
					visualStart={state.visualStart}
					visualEnd={state.visualEnd}
					cellSuggestions={[]}
				/>
				<CommandBar
					commandLine={state.commandLine}
					suggestions={suggestions}
					suggestionIndex={
						completionState.status === "cycling"
							? completionState.highlightIndex
							: -1
					}
					highlightedCandidate={highlightedCandidate}
					completionPrefix={completionPrefix}
				/>
				<HelpBar mode={state.mode} editorDescriptors={editorDescriptors} />
				<StatusBar
					mode={state.mode}
					cellCount={state.cells.length}
					activeIndex={state.activeIndex}
					sessionId={sessionId}
					dirty={state.dirty}
					sessionMode={state.sessionMode}
					message={state.message}
					visualStart={state.visualStart}
					visualEnd={state.visualEnd}
					defaultSection={state.defaultSection}
					defaultSchema={state.defaultSchema}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<WorkspaceStrip snapshot={workspace.snapshot} />
			<CellList
				cells={state.cells}
				activeIndex={state.activeIndex}
				mode={state.mode}
				draftText={state.draftText}
				lastEditCellId={state.lastEditCellId}
				visualStart={state.visualStart}
				visualEnd={state.visualEnd}
				cellSuggestions={cellSuggestions}
			/>
			<HelpBar mode={state.mode} editorDescriptors={editorDescriptors} />
			<StatusBar
				mode={state.mode}
				cellCount={state.cells.length}
				activeIndex={state.activeIndex}
				sessionId={sessionId}
				dirty={state.dirty}
				sessionMode={state.sessionMode}
				message={state.message}
				visualStart={state.visualStart}
				visualEnd={state.visualEnd}
				defaultSection={state.defaultSection}
				defaultSchema={state.defaultSchema}
			/>
		</Box>
	);
}
