import { Box } from "ink";
import { CellList } from "./CellList";
import { CommandBar } from "./CommandBar";
import { HelpBar } from "./HelpBar";
import { HelpScreen } from "./HelpScreen";
import { StatusBar } from "./StatusBar";
import { WorkspaceScreen, createStubSnapshot } from "./WorkspaceScreen";
import type { NotebookState } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";

interface NotebookProps {
	state: NotebookState;
	sessionId: string;
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	getAutocomplete: (partial: string) => AutocompleteSuggestion[];
}

export function Notebook({
	state,
	sessionId,
	editorDescriptors,
	cellDescriptors,
	getAutocomplete,
}: NotebookProps) {
	if (state.showHelp) {
		return (
			<HelpScreen
				editorDescriptors={editorDescriptors}
				cellDescriptors={cellDescriptors}
				onClose={() => {}}
			/>
		);
	}

	if (state.showWorkspace) {
		return (
			<WorkspaceScreen
				snapshot={createStubSnapshot()}
				onClose={() => {}}
			/>
		);
	}

	if (state.mode === "COMMAND") {
		return (
			<Box flexDirection="column" width="100%" height="100%">
				<CellList
					cells={state.cells}
					activeIndex={state.activeIndex}
					mode={state.mode}
					draftText={state.draftText}
					lastEditCellId={state.lastEditCellId}
					visualStart={state.visualStart}
					visualEnd={state.visualEnd}
				/>
				<CommandBar
					commandLine={state.commandLine}
					suggestions={getAutocomplete(state.commandLine.slice(1))}
					suggestionIndex={-1}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width="100%" height="100%">
			<CellList
				cells={state.cells}
				activeIndex={state.activeIndex}
				mode={state.mode}
				draftText={state.draftText}
				lastEditCellId={state.lastEditCellId}
				visualStart={state.visualStart}
				visualEnd={state.visualEnd}
			/>
			<HelpBar
				mode={state.mode}
				editorDescriptors={editorDescriptors}
			/>
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
			/>
		</Box>
	);
}