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
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { BranchDetailInspector } from "../../../components/BranchDetailInspector";
import { CommandBar } from "../../../components/CommandBar";
import { HelpBar } from "../../../components/HelpBar";
import { HistoryDetailPanel } from "../../../components/HistoryDetailPanel";
import { HistoryNavigation } from "../../../components/HistoryNavigation";
import { MacroDetailPanel } from "../../../components/MacroDetailPanel";
import { MacroEditor } from "../../../components/MacroEditor";
import { NotebookWorkspace } from "../../../components/NotebookWorkspace";
import { SidebarContainer } from "../../../components/SidebarContainer";
import { StatusBar } from "../../../components/StatusBar";
import type {
	AssessmentSubTabId,
	WorkspaceTabId,
} from "../../../components/WorkspaceTabs";
import type { CellSuggestion } from "../../../hooks/useNotebook";
import type {
	CommandCatalog,
	EditorKernelState,
	WindowDefinition,
	WindowRegion,
} from "../../editor";
import { knownVerbs } from "../../editor/command-autocomplete";
import { buildCommandDescriptors } from "../../editor/command-descriptors";
import type { SidebarViewTab } from "../../editor/kernel";
import type { MacroSlotProjection } from "../../editor/macro-slots";
import type { DocumentPlacementRef } from "@stateful-mcp/clinical";
import type { EditorFocusTarget } from "../../editor/interaction-state";
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
	availablePlacements?: DocumentPlacementRef[];
	selectedPlacement?: DocumentPlacementRef;
	selectPlacement?(placementId: string): void;
	childDefinitions?: MacroDefinition[];
	draftPreview?: MacroDraftPreview;
	sidebarOpen?: boolean;
	sidebarContent?: ReactElement | null;
	/** Active right-hand sidebar activity bar view. */
	sidebarTab?: SidebarViewTab;
	onSelectSidebarTab?(tab: SidebarViewTab): void;
	activeHistoryCell?: StructuredCell | null;
	workspaceTab?: WorkspaceTabId;
	assessmentSubTab?: AssessmentSubTabId;
	scratchpadContent?: ReactElement | null;
	editorContent?: ReactElement | null;
	sectionContent?: Partial<
		Record<
			"subjective" | "objective" | "assessment" | "plan",
			ReactElement | null
		>
	>;
	sectionScratchpadContent?: Partial<
		Record<
			"subjective" | "objective" | "assessment" | "plan",
			ReactElement | null
		>
	>;
	sectionEditorContent?: Partial<
		Record<
			"subjective" | "objective" | "assessment" | "plan",
			ReactElement | null
		>
	>;
	selectedBranchId?: string | null;
	selectedBranchIds?: readonly string[];
	assessmentSearchOpen?: boolean;
	assessmentSearchQuery?: string;
	historySearchQuery?: string;
	historySearchOpen?: boolean;
	historySearchMatches?: string[];
	historySearchMatchIndex?: number;
	workspaceSnapshot?: WorkspaceSnapshot | null;
	workspaceLoading?: boolean;
	workspaceError?: string | null;
	workspaceFocused?: boolean;
	soapContent?: ReactElement | null;
	consoleFocused?: boolean;
	focusTarget?: EditorFocusTarget;
	patientSidebarContent?: ReactElement | null;
	soapSidebarContent?: ReactElement | null;
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
							searchOpen={deps.historySearchOpen}
							searchMatches={deps.historySearchMatches}
							searchMatchIndex={deps.historySearchMatchIndex}
						/>
					);
				},
			});

			regions.push({
				slot: "primary",
				key: "notebook-workspace",
				render: () => (
					<NotebookWorkspace
						activeTab={deps.workspaceTab ?? "notebook"}
						snapshot={deps.workspaceSnapshot}
						loading={deps.workspaceLoading}
						error={deps.workspaceError}
						focused={deps.workspaceFocused}
						assessmentSubTab={deps.assessmentSubTab}
						scratchpadContent={deps.scratchpadContent}
						editorContent={deps.editorContent}
						sectionContent={deps.sectionContent}
						sectionScratchpadContent={deps.sectionScratchpadContent}
						sectionEditorContent={deps.sectionEditorContent}
						soapContent={deps.soapContent}
						selectedBranchId={deps.selectedBranchId}
						selectedBranchIds={deps.selectedBranchIds}
						assessmentSearchOpen={deps.assessmentSearchOpen}
						assessmentSearchQuery={deps.assessmentSearchQuery}
					/>
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
					availablePlacements: deps.availablePlacements,
					selectedPlacement: deps.selectedPlacement,
					onSelectPlacement: deps.selectPlacement,
					childDefinitions: deps.childDefinitions,
					authoringPreview,
					draftPreview: deps.draftPreview,
					executionMessage: deps.message,
					consoleFocused:
						deps.focusTarget === "macro-console" || deps.consoleFocused === true,
					selectionStart:
						deps.focusTarget === "macro-console" &&
						deps.editorState.mode === "VISUAL"
							? deps.editorState.visualStart
							: undefined,
					selectionEnd:
						deps.focusTarget === "macro-console" &&
						deps.editorState.mode === "VISUAL"
							? deps.editorState.visualEnd
							: undefined,
					showCursor:
						deps.focusTarget === "macro-console" &&
						deps.editorState.mode === "INSERT" &&
						deps.editorState.commandKind === "macro",
				};
				const isMacroInsertMode =
					deps.editorState.commandKind === "macro" &&
					deps.editorState.mode === "INSERT";

				regions.push({
					slot: "command",
					key: "macro-editor",
					render() {
						return <MacroEditor {...macroEditorProps} inputOnly />;
					},
				});
				if (deps.sidebarOpen) {
					const sidebarTab = deps.sidebarTab ?? "branches";
					const branchDetail = (
						<BranchDetailInspector
							snapshot={deps.workspaceSnapshot ?? null}
							activeBranchId={deps.selectedBranchId ?? undefined}
						/>
					);
					const manualDetail =
						deps.sidebarContent ??
						(sidebarTab === "branches" ? (
							branchDetail
						) : sidebarTab === "slots" ? (
							<MacroDetailPanel {...macroEditorProps} />
						) : sidebarTab === "patient" ? (
							(deps.patientSidebarContent ?? (
								<Text color="gray">Patient search unavailable</Text>
							))
						) : sidebarTab === "soap" ? (
							(deps.soapSidebarContent ?? (
								<Text color="gray">SOAP templates unavailable</Text>
							))
						) : deps.activeHistoryCell ? (
							<HistoryDetailPanel cell={deps.activeHistoryCell} />
						) : (
							<Box padding={1}>
								<Text color="gray">No active history entry</Text>
							</Box>
						));
					const detail = isMacroInsertMode ? (
						<MacroDetailPanel {...macroEditorProps} />
					) : (
						manualDetail
					);
					regions.push({
						slot: "sidebar",
						key: "macro-details",
						render: () => (
							<SidebarContainer
								activeTab={sidebarTab}
								onSelectTab={deps.onSelectSidebarTab}
							>
								{detail}
							</SidebarContainer>
						),
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
			if (deps.sidebarOpen && deps.editorState.mode === "COMMAND") {
				const sidebarTab = deps.sidebarTab ?? "branches";
				const detail =
					deps.sidebarContent ??
					(sidebarTab === "history" && deps.activeHistoryCell ? (
						<HistoryDetailPanel cell={deps.activeHistoryCell} />
					) : sidebarTab === "branches" ? (
						<BranchDetailInspector
							snapshot={deps.workspaceSnapshot ?? null}
							activeBranchId={deps.selectedBranchId ?? undefined}
						/>
					) : sidebarTab === "patient" ? (
						(deps.patientSidebarContent ?? (
							<Text color="gray">Patient search unavailable</Text>
						))
					) : sidebarTab === "soap" ? (
						(deps.soapSidebarContent ?? (
							<Text color="gray">SOAP templates unavailable</Text>
						))
					) : sidebarTab === "history" ? (
						<Box padding={1}>
							<Text color="gray">No active history entry</Text>
						</Box>
					) : (
						<Box padding={1}>
							<Text color="gray">
								Macro slots are available while authoring a macro.
							</Text>
						</Box>
					));
				regions.push({
					slot: "sidebar",
					key: "history-details-command",
					render: () => (
						<SidebarContainer
							activeTab={sidebarTab}
							onSelectTab={deps.onSelectSidebarTab}
						>
							{detail}
						</SidebarContainer>
					),
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
