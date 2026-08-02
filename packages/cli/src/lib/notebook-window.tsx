import { CellList } from "../components/CellList";
import { CommandBar } from "../components/CommandBar";
import { HelpBar } from "../components/HelpBar";
import { StatusBar } from "../components/StatusBar";
import type { CellSuggestion } from "../hooks/useNotebook";
import type {
	CommandCatalog,
	EditorKernelState,
	WindowDefinition,
	WindowRegion,
} from "./cell-editor";
import type { NotebookDocumentPort } from "./notebook-document";
import type { NotebookDomainPort } from "./notebook-domain";

export interface NotebookWindowDeps {
	document: NotebookDocumentPort;
	domain: NotebookDomainPort;
	catalog: CommandCatalog;
	sessionId: string;
	editorState: EditorKernelState;
	lastEditCellId: string | null;
	cellSuggestions?: CellSuggestion[];
}

/**
 * Window definition for the notebook. The container renders the shared regions
 * (cell list, command bar, help bar, status bar) and routes input through the
 * keymap and injected ports.
 */
export function notebookWindow(deps: NotebookWindowDeps): WindowDefinition {
	return {
		type: "notebook",
		regions: () => {
			const view = deps.document.getView();
			const context = {
				hostKind: "notebook",
				collection: { kind: "notebook", collectionId: deps.sessionId },
				sessionId: deps.sessionId,
			};
			const regions: WindowRegion[] = [];

			regions.push({
				slot: "primary",
				key: "cell-list",
				render() {
					return (
						<CellList
							cells={view.cells}
							activeIndex={view.activeIndex}
							mode={deps.editorState.mode}
							draftText={
								deps.editorState.mode === "INSERT"
									? deps.editorState.draftText
									: ""
							}
							lastEditCellId={deps.lastEditCellId}
							visualStart={view.selection?.start ?? 0}
							visualEnd={view.selection?.end ?? 0}
							cellSuggestions={deps.cellSuggestions ?? []}
						/>
					);
				},
			});

			if (deps.editorState.mode === "COMMAND") {
				const commandLine = deps.editorState.draftText;
				const suggestions = deps.catalog.getSuggestions(
					commandLine.slice(1),
					context,
				);
				const highlightedCandidate =
					deps.editorState.completion.status === "cycling"
						? (deps.editorState.completion.candidates[
								deps.editorState.completion.highlightIndex
							] ?? null)
						: null;
				const completionPrefix =
					deps.editorState.completion.status === "cycling"
						? deps.editorState.completion.session.prefix
						: commandLine.slice(1);

				regions.push({
					slot: "command",
					key: "command-prompt",
					render() {
						return (
							<CommandBar
								commandLine={commandLine}
								suggestions={suggestions}
								suggestionIndex={
									deps.editorState.completion.status === "cycling"
										? deps.editorState.completion.highlightIndex
										: -1
								}
								highlightedCandidate={highlightedCandidate}
								completionPrefix={completionPrefix}
							/>
						);
					},
				});
			}

			regions.push({
				slot: "footer",
				key: "help-bar",
				render() {
					const editorDescriptors = deps.catalog.getDescriptors(context);
					return (
						<HelpBar
							mode={deps.editorState.mode}
							editorDescriptors={editorDescriptors}
						/>
					);
				},
			});

			regions.push({
				slot: "status",
				key: "status-bar",
				render() {
					return (
						<StatusBar
							mode={deps.editorState.mode}
							cellCount={view.cells.length}
							activeIndex={view.activeIndex}
							sessionId={deps.sessionId}
							dirty={false}
							sessionMode="execute"
							message={null}
							visualStart={view.selection?.start ?? 0}
							visualEnd={view.selection?.end ?? 0}
							defaultSection="subjective"
							defaultSchema={null}
						/>
					);
				},
			});

			return regions;
		},
	};
}
