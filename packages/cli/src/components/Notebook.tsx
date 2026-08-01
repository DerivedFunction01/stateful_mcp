import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { NotebookState } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { Box } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import { useWorkspace } from "../hooks/useWorkspace";
import { CellInfoPanel } from "./CellInfoPanel";
import { CellList } from "./CellList";
import { CommandBar } from "./CommandBar";
import { HelpBar } from "./HelpBar";
import { HelpScreen } from "./HelpScreen";
import { StatusBar } from "./StatusBar";
import { WorkspaceScreen } from "./WorkspaceScreen";

interface NotebookProps {
	state: NotebookState;
	sessionId: string;
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	getAutocomplete: (partial: string) => AutocompleteSuggestion[];
	cellSuggestions: CellSuggestion[];
}

export function Notebook({
	state,
	sessionId,
	editorDescriptors,
	cellDescriptors,
	getAutocomplete,
	cellSuggestions,
}: NotebookProps) {
	const workspace = useWorkspace({
		showWorkspace: state.showWorkspace,
		sessionId,
		soapNoteId: sessionId,
	});

	if (state.showHelp) {
		return (
			<HelpScreen
				editorDescriptors={editorDescriptors}
				cellDescriptors={cellDescriptors}
				onClose={() => {}}
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
				loading={workspace.loading}
				error={workspace.error}
				focused={workspace.focused}
				onClose={() => {}}
				onProcessInput={async (branchId, text) => {
					if (!workspace.snapshot) return;
					await workspace.processInput(
						workspace.snapshot.workspaceId,
						branchId,
						text,
					);
				}}
				onComplete={async (branchId) => {
					await workspace.complete(branchId);
				}}
				onAddBranch={async (name, text) => {
					await workspace.addBranch(name, text);
				}}
				onToggleFocus={workspace.toggleFocus}
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
					cellSuggestions={[]}
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
