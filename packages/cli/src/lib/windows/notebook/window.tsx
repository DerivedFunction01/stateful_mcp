import type {
	CommandSyntaxProfile,
	MacroDefinition,
	MacroDraftPreview,
} from "@stateful-mcp/clinical";
import {
	type MacroAuthoringValue,
	renderMacroAuthoringTemplate,
} from "@stateful-mcp/clinical";
import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { ReactElement } from "react";
import { CommandBar } from "../../../components/CommandBar";
import { HelpBar } from "../../../components/HelpBar";
import { HistoryDetailPanel } from "../../../components/HistoryDetailPanel";
import { HistoryNavigation } from "../../../components/HistoryNavigation";
import { MacroDetailPanel } from "../../../components/MacroDetailPanel";
import { MacroEditor } from "../../../components/MacroEditor";
import { NotebookWorkspace } from "../../../components/NotebookWorkspace";
import { StatusBar } from "../../../components/StatusBar";
import type { WorkspaceTabId } from "../../../components/WorkspaceTabs";
import type { CellSuggestion } from "../../../hooks/useNotebook";
import type {
	CommandCatalog,
	EditorKernelState,
	WindowDefinition,
	WindowRegion,
} from "../../editor";
import { knownVerbs } from "../../editor/command-autocomplete";
import { buildCommandDescriptors } from "../../editor/command-descriptors";
import type { MacroSlotProjection } from "../../editor/macro-slots";
import type { NotebookDocumentPort } from "./document";
import type { NotebookDomainPort } from "./domain";

export interface NotebookWindowDeps {
	document: NotebookDocumentPort;
	domain: NotebookDomainPort;
	catalog: CommandCatalog;
	sessionId: string;
	editorState: EditorKernelState;
	lastEditCellId: string | null;
	cellSuggestions?: CellSuggestion[];
	dirty?: boolean;
	sessionMode?: "execute" | "preview";
	defaultSection?: string;
	defaultSchema?: string | null;
	message?: string | null;
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	cursorOffset?: number;
	/** Active syntax profile for canonical descriptor/knownVerbs derivation. */
	syntaxProfile?: CommandSyntaxProfile;
	activeDefinition?: MacroDefinition | null;
	childDefinitions?: MacroDefinition[];
	draftPreview?: MacroDraftPreview;
	sidebarOpen?: boolean;
	sidebarContent?: ReactElement | null;
	activeHistoryCell?: StructuredCell | null;
	workspaceTab?: WorkspaceTabId;
	historySearchQuery?: string;
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
				slot: "navigation",
				key: "history-navigation",
				render() {
					return (
						<HistoryNavigation
							cells={view.cells}
							activeIndex={view.activeIndex}
							mode={
								deps.editorState.commandKind === "macro" &&
								deps.editorState.mode === "VISUAL"
									? "NORMAL"
									: deps.editorState.mode
							}
							visualStart={view.selection?.start ?? 0}
							visualEnd={view.selection?.end ?? 0}
							searchQuery={deps.historySearchQuery}
						/>
					);
				},
			});

			regions.push({
				slot: "primary",
				key: "notebook-workspace",
				render: () => (
					<NotebookWorkspace activeTab={deps.workspaceTab ?? "notebook"} />
				),
			});

			if (deps.editorState.mode !== "COMMAND") {
				const draftText = deps.editorState.draftText;
				const matchedTemplateIndex = deps.macroSlots
					?.find((slot) => slot.formId?.startsWith("template:"))
					?.formId?.match(/^template:(\d+)/)?.[1];
				const authoringTemplate =
					deps.activeDefinition?.authoringTemplates?.[
						matchedTemplateIndex ? Number(matchedTemplateIndex) : 0
					];
				const authoringPreview = authoringTemplate
					? renderMacroAuthoringTemplate(
							authoringTemplate,
							(deps.macroSlots ?? []).map((slot): MacroAuthoringValue => {
								const argSpec = deps.activeDefinition?.arguments.find(
									(a) => a.argumentId === slot.argumentId,
								);
								const isConceptArg =
									argSpec?.extraction.kind === "concept" ||
									argSpec?.extraction.kind === "concept_array";
								// Concept slots require an explicit binding with conceptId to be "bound".
								// A plain positional/inferred parser match is not a validated concept.
								const isBound =
									slot.status === "locked"
										? true
										: isConceptArg
											? Boolean(slot.binding?.conceptId)
											: Boolean(slot.binding) || slot.status === "bound";
								return {
									argumentId: slot.argumentId,
									value:
										slot.binding?.displayValue ??
										(isBound ? slot.rawText : undefined),
									status: isBound
										? "bound"
										: slot.status === "invalid"
											? "invalid"
											: "unresolved",
								};
							}),
						)
					: undefined;
				const macroEditorProps = {
					draftText,
					cursorOffset: deps.cursorOffset ?? draftText.length,
					macroSlots: deps.macroSlots,
					activeMacroArgumentId: deps.activeMacroArgumentId,
					activeDefinition: deps.activeDefinition,
					childDefinitions: deps.childDefinitions,
					authoringPreview,
					draftPreview: deps.draftPreview,
					executionMessage: deps.message,
					selectionStart:
						deps.editorState.mode === "VISUAL"
							? deps.editorState.visualStart
							: undefined,
					selectionEnd:
						deps.editorState.mode === "VISUAL"
							? deps.editorState.visualEnd
							: undefined,
					showCursor:
						deps.editorState.mode === "INSERT" &&
						deps.editorState.commandKind === "macro",
				};

				regions.push({
					slot: "command",
					key: "macro-editor",
					render() {
						return <MacroEditor {...macroEditorProps} inputOnly />;
					},
				});
				if (deps.sidebarOpen) {
					const detail =
						deps.sidebarContent ??
						(deps.editorState.commandKind === "macro" &&
						(deps.editorState.mode === "INSERT" ||
							deps.editorState.mode === "VISUAL") ? (
							<MacroDetailPanel {...macroEditorProps} />
						) : deps.activeHistoryCell ? (
							<HistoryDetailPanel cell={deps.activeHistoryCell} />
						) : (
							<MacroDetailPanel {...macroEditorProps} />
						));
					regions.push({
						slot: "sidebar",
						key: "macro-details",
						render: () => detail,
					});
				}
			} else if (deps.editorState.mode === "COMMAND") {
				const commandLine = deps.editorState.draftText;
				const catalogSuggestions = deps.catalog.getSuggestions(
					commandLine.slice(1),
					context,
				);
				const suggestions = catalogSuggestions;
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

				// Derive knownVerbs from the active syntax profile so the no-match
				// warning is suppressed for recognized verbs (e.g. `var`) that
				// produced no argument suggestions.
				const known = deps.syntaxProfile
					? knownVerbs(
							buildCommandDescriptors(deps.syntaxProfile, {
								variableName: deps.syntaxProfile.variableCommandName,
								variableAliases: ["variable"],
							}),
						)
					: undefined;

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
								knownVerbs={known}
								showCursor={false}
							/>
						);
					},
				});
			}
			if (
				deps.sidebarOpen &&
				deps.editorState.mode === "COMMAND" &&
				deps.activeHistoryCell
			) {
				regions.push({
					slot: "sidebar",
					key: "history-details-command",
					render: () => <HistoryDetailPanel cell={deps.activeHistoryCell!} />,
				});
			}

			// TODO(cli2-v2): add a NotebookPreviewWorkflow presentation region.

			regions.push({
				slot: "footer",
				key: "help-bar",
				render() {
					const editorDescriptors = deps.catalog.getDescriptors(context);
					return (
						<HelpBar
							mode={deps.editorState.mode}
							commandKind={deps.editorState.commandKind}
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
							dirty={deps.dirty ?? false}
							sessionMode={deps.sessionMode ?? "execute"}
							message={deps.message ?? null}
							visualStart={view.selection?.start ?? 0}
							visualEnd={view.selection?.end ?? 0}
							defaultSection={deps.defaultSection ?? "subjective"}
							defaultSchema={deps.defaultSchema ?? null}
						/>
					);
				},
			});

			return regions;
		},
	};
}
