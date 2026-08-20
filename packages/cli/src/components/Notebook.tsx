import type { MacroDefinition } from "@stateful-mcp/clinical";
import {
	BRANCH_STATUS_TO_TRANSITION,
	getActiveMacroArgumentId,
} from "@stateful-mcp/clinical";
import type { CellPreview } from "@stateful-mcp/clinical/cells/cell-service-types";
import type { ClinicalDocumentReadModel } from "@stateful-mcp/clinical/clinical/clinical-document-types";
import type { CommandHistoryCandidate } from "@stateful-mcp/clinical/learning/command-history";
import type {
	NotebookUiState,
	ScratchpadCell,
} from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type {
	ClinicalProseTemplate,
	SoapSection,
} from "@stateful-mcp/clinical/rendering/template-types";
import type { WorkspaceOperation } from "@stateful-mcp/clinical/workspaces/workspace-types";
import { useApp } from "ink";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useNotebook } from "../hooks/useNotebook";
import { useSession } from "../hooks/useSession";
import { useWorkspace } from "../hooks/useWorkspace";
import type {
	AutocompleteSuggestion,
	CellEditorMode,
	EditorAction,
	EditorKernelState,
	WindowOverlay,
	WindowOverlayAction,
} from "../lib/cell-editor";
import type { CompletionState } from "../lib/editor/completion-state";
import type { EditorFocusTarget } from "../lib/editor/interaction-state";
import { focusForSection } from "../lib/editor/interaction-state";
import { useNotebookRuntime } from "../lib/runtime/notebook-runtime";
import { createDifferentialScratchpadAdapter } from "../lib/scratchpad/differential-scratchpad-adapter";
import { t } from "../lib/shared/i18n";
import { NotebookCommandCatalog } from "../lib/windows/notebook/catalog";
import { NotebookDocumentPort } from "../lib/windows/notebook/document";
import { WindowDomainPort } from "../lib/windows/notebook/domain";
import { dispatchGeneralWindowCommand } from "../lib/windows/notebook/extension";
import { NotebookKeymapPolicy } from "../lib/windows/notebook/keymap-policy";
import { notebookWindow } from "../lib/windows/notebook/window";
import { CellInfoPanel } from "./CellInfoPanel";
import { HelpScreen } from "./HelpScreen";
import { HistoryOverlay } from "./HistoryOverlay";
import { PreviewScreen } from "./PreviewScreen";
import { RapidScratchpadOverlay } from "./RapidScratchpadOverlay";
import { ScratchpadEditor } from "./ScratchpadEditor";
import { INITIAL_SEARCH_STATE, searchReducer } from "./SearchOverlay";
import { SectionScratchpad } from "./SectionScratchpad";
import { DEFAULT_SIDEBAR_TAB, type SidebarViewTab } from "./SidebarActivityBar";
import { PatientSidebar, SoapTemplateSidebar } from "./SoapSidebar";
import { SoapWorkspace } from "./SoapWorkspace";
import { WindowContainer } from "./WindowContainer";
import { Workspace } from "./Workspace";
import {
	type AssessmentSubTabId,
	nextAssessmentSubTab,
	nextWorkspaceTab,
	previousWorkspaceTab,
	WORKSPACE_TABS,
	type WorkspaceTabId,
} from "./WorkspaceTabs";

/**
 * Independent notebook root. Owns a separate useSession/useNotebook and runs
 * the notebook command path through the extension intent/effect runtime.
 */
export function Notebook({
	preferredSessionId,
}: {
	preferredSessionId?: string;
}) {
	const session = useSession(preferredSessionId);
	const [overlay, setOverlay] = useState<WindowOverlay | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [sidebarTab, setSidebarTab] =
		useState<SidebarViewTab>(DEFAULT_SIDEBAR_TAB);
	const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>("notebook");
	const [consoleFocused, setConsoleFocused] = useState(false);
	const [focusTarget, setFocusTarget] = useState<EditorFocusTarget>("history");
	const consoleReturnFocusRef = useRef<EditorFocusTarget>("history");
	const consoleReturnModeRef = useRef<CellEditorMode>("NORMAL");
	const [assessmentSubTab, setAssessmentSubTab] =
		useState<AssessmentSubTabId | null>(null);
	useEffect(() => {
		if (
			workspaceTab !== "assessment" &&
			workspaceTab !== "subjective" &&
			workspaceTab !== "objective" &&
			workspaceTab !== "plan"
		)
			return;
		if (assessmentSubTab === "default" && workspaceTab !== "assessment")
			setAssessmentSubTab("scratchpad");
	}, [workspaceTab, assessmentSubTab]);
	useEffect(() => {
		const current = notebookUiStateRef.current;
		if (!session || !current || current.workspace?.activeTab === workspaceTab)
			return;
		const next: NotebookUiState = {
			...current,
			workspace: { ...current.workspace, activeTab: workspaceTab },
		};
		notebookUiStateRef.current = next;
		void session.v2.notebook.saveUiState({
			uiState: next,
			expectedRevision: notebookRevisionRef.current,
		});
		notebookRevisionRef.current += 1;
	}, [session, workspaceTab]);
	useEffect(() => {
		const current = notebookUiStateRef.current;
		if (!session || !current || !assessmentSubTab) return;
		if (
			workspaceTab !== "subjective" &&
			workspaceTab !== "objective" &&
			workspaceTab !== "assessment" &&
			workspaceTab !== "plan"
		)
			return;
		const section = workspaceTab as SoapSection;
		const state = current.soap?.sections[section];
		if (!current.soap || !state || state.activeTab === assessmentSubTab) return;
		const next: NotebookUiState = {
			...current,
			soap: {
				...current.soap,
				sections: {
					...current.soap.sections,
					[section]: { ...state, activeTab: assessmentSubTab },
				},
			},
		};
		notebookUiStateRef.current = next;
		void session.v2.notebook.saveUiState({
			uiState: next,
			expectedRevision: notebookRevisionRef.current,
		});
		notebookRevisionRef.current += 1;
	}, [assessmentSubTab, session, workspaceTab]);
	const notebook = useNotebook(session, {
		onOpenHistory: () => setOverlay({ route: "history" }),
	});
	const { exit } = useApp();
	const { state, dispatch, cellSuggestions, getAutocomplete, macroSession } =
		notebook;
	const isMacroAuthoring =
		(state.mode === "INSERT" && state.commandKind === "macro") ||
		state.mode === "MACRO";
	const [completion, setCompletion] = useState<CompletionState>({
		status: "idle",
	});
	const [showHelp, setShowHelp] = useState(false);
	const [activeWindow, setActiveWindow] = useState<"notebook" | "workspace">(
		"notebook",
	);
	const workspace = useWorkspace({
		showWorkspace:
			activeWindow === "workspace" || workspaceTab === "assessment",
		sessionId: session?.sessionId ?? "",
		soapNoteId: session?.sessionId ?? "",
		session,
	});
	const [soapDocument, setSoapDocument] =
		useState<ClinicalDocumentReadModel | null>(null);
	const [soapTemplates, setSoapTemplates] = useState<ClinicalProseTemplate[]>(
		[],
	);
	const [scratchpadMacros, setScratchpadMacros] = useState<MacroDefinition[]>(
		[],
	);
	const differentialScratchpadAdapter = useMemo(
		() => createDifferentialScratchpadAdapter(),
		[],
	);
	const [soapLoading, setSoapLoading] = useState(false);
	const [soapError, setSoapError] = useState<string | null>(null);
	const [assessmentScratchpadCells, setAssessmentScratchpadCells] = useState<
		ScratchpadCell[]
	>([]);
	const [sectionCells, setSectionCells] = useState<
		Partial<Record<SoapSection, ScratchpadCell[]>>
	>({});
	const [assessmentScratchpadReady, setAssessmentScratchpadReady] =
		useState(false);
	const notebookUiStateRef = useRef<NotebookUiState | undefined>(undefined);
	const notebookRevisionRef = useRef(0);
	useEffect(() => {
		if (!session) return;
		let cancelled = false;
		setSoapLoading(true);
		setSoapError(null);
		void Promise.all([
			session.v2.notebookSessionStore.get(session.sessionId),
			session.v2.proseTemplateStore.list(),
			session.v2.macroStore.list(),
		])
			.then(async ([record, templates, macros]) => {
				const document = record?.documentId
					? await session.v2.engine.getDocument(record.documentId)
					: null;
				if (cancelled) return;
				setSoapDocument(document);
				setSoapTemplates(templates);
				setScratchpadMacros(
					macros.filter((macro) => macro.active && macro.status !== "retired"),
				);
				const savedWorkspaceTab = record?.uiState?.workspace?.activeTab;
				if (
					savedWorkspaceTab &&
					WORKSPACE_TABS.some((tab) => tab.id === savedWorkspaceTab)
				)
					setWorkspaceTab(savedWorkspaceTab as WorkspaceTabId);
				setConsoleFocused(record?.uiState?.console?.focused === true);
				setFocusTarget(
					record?.uiState?.console?.focused ? "macro-console" : "history",
				);
				const assessmentState = record?.uiState?.soap?.sections.assessment;
				if (assessmentState) {
					notebookUiStateRef.current = record.uiState;
					notebookRevisionRef.current = record.revision;
					setAssessmentScratchpadCells(assessmentState.cells);
					setAssessmentScratchpadReady(true);
					setAssessmentSubTab(assessmentState.activeTab as AssessmentSubTabId);
				}
				if (record?.uiState?.soap?.sections) {
					setSectionCells(
						Object.fromEntries(
							Object.entries(record.uiState.soap.sections).map(
								([section, state]) => [section, state?.cells ?? []],
							),
						) as Partial<Record<SoapSection, ScratchpadCell[]>>,
					);
				}
				setSoapLoading(false);
			})
			.catch((cause) => {
				if (cancelled) return;
				setSoapError(cause instanceof Error ? cause.message : String(cause));
				setSoapLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [session]);
	const persistAssessmentScratchpad = useCallback(
		(cells: readonly ScratchpadCell[]) => {
			setAssessmentScratchpadCells([...cells]);
			const current = notebookUiStateRef.current;
			if (!current?.soap) return;
			const assessment = current.soap.sections.assessment;
			if (!assessment) return;
			const next: NotebookUiState = {
				...current,
				soap: {
					...current.soap,
					sections: {
						...current.soap.sections,
						assessment: { ...assessment, cells: [...cells] },
					},
				},
			};
			notebookUiStateRef.current = next;
			void session?.v2.notebook.saveUiState({
				uiState: next,
				expectedRevision: notebookRevisionRef.current,
			});
			notebookRevisionRef.current += 1;
		},
		[session],
	);
	const persistSectionScratchpad = useCallback(
		(section: SoapSection, cells: readonly ScratchpadCell[]) => {
			setSectionCells((current) => ({ ...current, [section]: [...cells] }));
			const current = notebookUiStateRef.current;
			const state = current?.soap?.sections[section];
			if (!current?.soap || !state || !session) return;
			const next: NotebookUiState = {
				...current,
				soap: {
					...current.soap,
					sections: {
						...current.soap.sections,
						[section]: { ...state, cells: [...cells] },
					},
				},
			};
			notebookUiStateRef.current = next;
			void session.v2.notebook.saveUiState({
				uiState: next,
				expectedRevision: notebookRevisionRef.current,
			});
			notebookRevisionRef.current += 1;
		},
		[session],
	);
	const toggleConsoleFocus = useCallback(() => {
		const focused = !consoleFocused;
		setConsoleFocused(focused);
		if (focused) {
			consoleReturnFocusRef.current = focusTarget;
			consoleReturnModeRef.current = state.mode;
			setFocusTarget("macro-console");
			if (state.commandKind !== "macro") {
				dispatch({
					type: "begin_edit",
					cellId: "macro-console",
					mode: "INSERT",
					commandKind: "macro",
					text:
						state.draftText || session?.v2.syntaxProfile.macroStartToken || "",
				});
			}
		} else {
			setFocusTarget(consoleReturnFocusRef.current);
			dispatch({ type: "set_command_kind", commandKind: "direct" });
			dispatch({ type: "set_mode", mode: consoleReturnModeRef.current });
		}
		const current = notebookUiStateRef.current;
		if (!current || !session) return;
		const next: NotebookUiState = {
			...current,
			console: { ...current.console, focused },
		};
		notebookUiStateRef.current = next;
		void session.v2.notebook.saveUiState({
			uiState: next,
			expectedRevision: notebookRevisionRef.current,
		});
		notebookRevisionRef.current += 1;
	}, [
		consoleFocused,
		focusTarget,
		session,
		state.commandKind,
		state.draftText,
		state.mode,
	]);
	useEffect(() => {
		if (consoleFocused) return;
		if (assessmentSubTab !== "scratchpad") {
			setFocusTarget("history");
			return;
		}
		if (
			workspaceTab === "assessment" ||
			workspaceTab === "subjective" ||
			workspaceTab === "objective" ||
			workspaceTab === "plan"
		)
			setFocusTarget(focusForSection(workspaceTab));
	}, [assessmentSubTab, consoleFocused, workspaceTab]);
	const persistSubjectiveScratchpad = useCallback(
		(cells: readonly ScratchpadCell[]) =>
			persistSectionScratchpad("subjective", cells),
		[persistSectionScratchpad],
	);
	const persistObjectiveScratchpad = useCallback(
		(cells: readonly ScratchpadCell[]) =>
			persistSectionScratchpad("objective", cells),
		[persistSectionScratchpad],
	);
	const persistPlanScratchpad = useCallback(
		(cells: readonly ScratchpadCell[]) =>
			persistSectionScratchpad("plan", cells),
		[persistSectionScratchpad],
	);
	const executeSectionScratchpad = useCallback(
		async (section: SoapSection, cells: readonly ScratchpadCell[]) => {
			let invocationCount = 0;
			try {
				for (const cell of cells) {
					for (const macroId of cell.pinnedMacroIds) {
						if (!session) throw new Error(t("workspace.sessionUnavailable"));
						await session.v2.notebook.executeMacroInvocation({
							macroId,
							text: cell.text,
						});
						invocationCount += 1;
					}
				}
				if (invocationCount === 0)
					throw new Error(t("workspace.sectionScratchpad.noPinnedMacros"));
				dispatch({
					type: "set_message",
					message: t("workspace.sectionScratchpad.executed", {
						count: invocationCount,
						section: t(`section.${section}`),
					}),
				});
			} catch (error) {
				dispatch({
					type: "set_message",
					message:
						error instanceof Error
							? error.message
							: t("workspace.sectionScratchpad.executionFailed"),
				});
				throw error;
			}
		},
		[session],
	);
	const sectionScratchpadContent = {
		subjective: sectionCells.subjective ? (
			<SectionScratchpad
				active={
					workspaceTab === "subjective" && assessmentSubTab === "scratchpad"
				}
				cells={sectionCells.subjective}
				createCellId={() => crypto.randomUUID()}
				onCellsChange={persistSubjectiveScratchpad}
				onExecute={(cells) => executeSectionScratchpad("subjective", cells)}
				mode={state.mode}
				onModeChange={(mode) => dispatch({ type: "set_mode", mode })}
			/>
		) : null,
		objective: sectionCells.objective ? (
			<SectionScratchpad
				active={
					workspaceTab === "objective" && assessmentSubTab === "scratchpad"
				}
				cells={sectionCells.objective}
				createCellId={() => crypto.randomUUID()}
				onCellsChange={persistObjectiveScratchpad}
				onExecute={(cells) => executeSectionScratchpad("objective", cells)}
				mode={state.mode}
				onModeChange={(mode) => dispatch({ type: "set_mode", mode })}
			/>
		) : null,
		plan: sectionCells.plan ? (
			<SectionScratchpad
				active={workspaceTab === "plan" && assessmentSubTab === "scratchpad"}
				cells={sectionCells.plan}
				createCellId={() => crypto.randomUUID()}
				onCellsChange={persistPlanScratchpad}
				onExecute={(cells) => executeSectionScratchpad("plan", cells)}
				mode={state.mode}
				onModeChange={(mode) => dispatch({ type: "set_mode", mode })}
			/>
		) : null,
	};
	const sectionEditorContent = {
		subjective: sectionCells.subjective ? (
			<ScratchpadEditor
				active={workspaceTab === "subjective" && assessmentSubTab === "editor"}
				cells={sectionCells.subjective}
				macros={scratchpadMacros}
				onCellsChange={persistSubjectiveScratchpad}
			/>
		) : null,
		objective: sectionCells.objective ? (
			<ScratchpadEditor
				active={workspaceTab === "objective" && assessmentSubTab === "editor"}
				cells={sectionCells.objective}
				macros={scratchpadMacros}
				onCellsChange={persistObjectiveScratchpad}
			/>
		) : null,
		plan: sectionCells.plan ? (
			<ScratchpadEditor
				active={workspaceTab === "plan" && assessmentSubTab === "editor"}
				cells={sectionCells.plan}
				macros={scratchpadMacros}
				onCellsChange={persistPlanScratchpad}
			/>
		) : null,
	};
	const isAssessmentNavigation = workspaceTab === "assessment";
	const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
	const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
	const [assessmentSearchState, assessmentSearchDispatch] = useReducer(
		searchReducer,
		INITIAL_SEARCH_STATE,
	);
	const assessmentSearchItems = useMemo(
		() =>
			(workspace.snapshot?.branches ?? []).map((branch) => ({
				cellId: branch.branchId,
				authored: {
					rawText: [
						branch.name,
						branch.hypothesisConcept?.display,
						...branch.supportingConcepts.map((concept) => concept.display),
						...branch.refutingConcepts.map((concept) => concept.display),
					]
						.filter(Boolean)
						.join(" "),
				},
			})),
		[workspace.snapshot?.branches],
	);
	const [searchState, searchDispatch] = useReducer(
		searchReducer,
		INITIAL_SEARCH_STATE,
	);

	useEffect(() => {
		const branches = workspace.snapshot?.branches ?? [];
		if (branches.length === 0) {
			setSelectedBranchId(null);
			return;
		}
		setSelectedBranchId((current) => {
			if (current && branches.some((branch) => branch.branchId === current))
				return current;
			return (
				workspace.snapshot?.activeBranchId ?? branches[0]?.branchId ?? null
			);
		});
		setSelectedBranchIds((current) =>
			current.filter((branchId) =>
				branches.some((branch) => branch.branchId === branchId),
			),
		);
	}, [workspace.snapshot?.branches, workspace.snapshot?.activeBranchId]);

	useEffect(() => {
		if (
			assessmentSearchState.open &&
			assessmentSearchState.matches.length > 0 &&
			assessmentSearchState.matchIndex >= 0
		) {
			setSelectedBranchId(
				assessmentSearchState.matches[assessmentSearchState.matchIndex] ?? null,
			);
		}
	}, [
		assessmentSearchState.open,
		assessmentSearchState.matches,
		assessmentSearchState.matchIndex,
	]);

	const moveAssessmentBranch = (direction: "up" | "down") => {
		const branches = workspace.snapshot?.branches ?? [];
		const ids =
			assessmentSearchState.open && assessmentSearchState.query
				? assessmentSearchState.matches
				: branches.map((branch) => branch.branchId);
		if (ids.length === 0) return;
		const currentIndex = Math.max(0, ids.indexOf(selectedBranchId ?? ""));
		const nextIndex = Math.min(
			Math.max(0, ids.length - 1),
			currentIndex + (direction === "down" ? 1 : -1),
		);
		setSelectedBranchId(ids[nextIndex] ?? null);
	};

	const toggleSelectedBranch = () => {
		if (!selectedBranchId) return;
		setSelectedBranchIds((current) =>
			current.includes(selectedBranchId)
				? current.filter((branchId) => branchId !== selectedBranchId)
				: [...current, selectedBranchId],
		);
	};

	const selectAllBranches = () => {
		setSelectedBranchIds(
			(workspace.snapshot?.branches ?? []).map((branch) => branch.branchId),
		);
	};

	const clearBranchSelection = () => setSelectedBranchIds([]);
	const targetBranchIds = selectedBranchIds;
	const targetBranches = (workspace.snapshot?.branches ?? []).filter((branch) =>
		targetBranchIds.includes(branch.branchId),
	);
	const targetScopeLabel =
		selectedBranchIds.length === (workspace.snapshot?.branches.length ?? 0) &&
			selectedBranchIds.length > 0
			? t("workspace.scope.all")
			: selectedBranchIds.length > 0
				? t("workspace.scope.selected")
				: t("workspace.scope.differential");
	const engineSuggestionsRef = useRef<any[]>([]);
	const [historyCandidates, setHistoryCandidates] = useState<
		CommandHistoryCandidate[]
	>([]);
	const historyEntries = useMemo(() => {
		const macroEntries: CommandHistoryCandidate[] = state.cells
			.filter((cell) => Boolean(cell.authored.finalizedMacro))
			.map((cell) => ({
				commandText: cell.authored.finalizedMacro!.authoredText,
				canonicalVerb: cell.authored.finalizedMacro!.macroDefinitionId,
				commandId: cell.authored.finalizedMacro!.macroDefinitionId,
				sessionCount: 1,
				allCount: 1,
				sessionLastUsedAt: cell.source.createdAt,
				allLastUsedAt: cell.source.createdAt,
			}));
		const seen = new Set<string>();
		return [...macroEntries, ...historyCandidates].filter((entry) => {
			if (seen.has(entry.commandText)) return false;
			seen.add(entry.commandText);
			return true;
		});
	}, [historyCandidates, state.cells]);

	useEffect(() => {
		if (!macroSession || !isMacroAuthoring) return;
		const current = macroSession.getSnapshot();
		if (
			current.rawText !== state.draftText ||
			current.cursorOffset !== state.cursorOffset
		) {
			macroSession.dispatch({
				type: "set_text",
				text: state.draftText,
				cursorOffset: state.cursorOffset,
			});
		}
	}, [macroSession, isMacroAuthoring, state.draftText, state.cursorOffset]);

	useEffect(() => {
		if (!session || overlay?.route !== "history") return;
		void session.v2.commandHistoryStore
			.query({ sessionId: session.sessionId, scope: "merged", limit: 100 })
			.then(setHistoryCandidates)
			.catch(() => setHistoryCandidates([]));
	}, [overlay?.route, session]);

	useEffect(() => {
		if (state.preview && !isMacroAuthoring && !overlay) {
			setOverlay({
				route: "preview",
				payload: state.preview,
				originCellId: state.preview.cellId,
			});
		}
	}, [state.preview, isMacroAuthoring, overlay]);

	const cellDescriptors = useMemo(
		() => ({ getDescriptors: () => [] as any[] }),
		[],
	);

	const runtime = useNotebookRuntime({
		sessionId: session?.sessionId ?? "",
		notebook,
		cellDescriptors,
		onCommandResultAccepted: () => {
			setCompletion({ status: "idle" });
			setShowHelp(false);
			dispatch({ type: "set_mode", mode: "NORMAL" });
		},
		onAppQuit: () => exit(),
		onMessage: (message) => dispatch({ type: "set_message", message }),
		executeVariableCommand: async (line) => {
			try {
				if (!session)
					return { success: false, message: "CLI2 session is not ready" };
				const snapshot = await session.v2.notebook.loadEditorSnapshot();
				const result = await session.v2.commandBar.execute({
					rawText: line,
					sessionId: session.sessionId,
					workspaceId: snapshot.record.workspaceId,
					documentId: snapshot.record.documentId,
					cellId: snapshot.activeCellId,
				});
				return {
					success: result.status === "committed",
					message: result.error,
				};
			} catch (error) {
				return {
					success: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},
		onOpenOverlay: (route, payload) => {
			if (route === "search") {
				const term = (payload as any)?.query ?? "";
				searchDispatch({ type: "OPEN", query: term, cells: state.cells });
				return;
			}
			setOverlay((prev) => {
				const originCellId =
					route === "info" || route === "preview"
						? state.cells[state.activeIndex]?.cellId
						: undefined;
				return { route, payload, originCellId };
			});
		},
		onCloseOverlay: () => {
			searchDispatch({ type: "CLEAR" });
			setOverlay(null);
		},
		onSwitchWindow: (windowKind) => {
			if (windowKind === "workspace" || windowKind === "notebook") {
				setActiveWindow(windowKind);
			}
		},
	});

	const context = useMemo(
		() => ({
			hostKind: "notebook" as const,
			collection: {
				kind: "notebook" as const,
				collectionId: session?.sessionId ?? "",
			},
			sessionId: session?.sessionId ?? "",
		}),
		[session?.sessionId],
	);

	const scope = useMemo(
		() => ({
			windowKind: "notebook",
			sessionId: session?.sessionId ?? "",
			collection: {
				kind: "notebook" as const,
				collectionId: session?.sessionId ?? "",
			},
		}),
		[session?.sessionId],
	);

	const catalog = useMemo(() => {
		return new NotebookCommandCatalog(
			runtime.runtime.catalog.descriptors(scope),
			getAutocomplete,
		);
	}, [scope, session?.sessionId, getAutocomplete]);

	const staticCandidates = useMemo(() => {
		if (state.mode !== "COMMAND" && !isMacroAuthoring) return [];
		const input = isMacroAuthoring ? state.draftText : state.commandLine;
		return getAutocomplete(input.slice(1));
	}, [
		state.mode,
		state.commandKind,
		state.commandLine,
		state.draftText,
		session?.sessionId,
		getAutocomplete,
	]);

	// TODO(cli2-v2): replace the retired V1 engine/macro completion hooks with
	//  notebook autocomplete and NotebookPreviewWorkflow presentation.
	const loading = false;
	const engineCandidates = useMemo<AutocompleteSuggestion[]>(() => [], []);
	const mergedCandidates = state.mode === "COMMAND" ? staticCandidates : [];
	const completionCandidates = useMemo(() => {
		return mergedCandidates;
	}, [mergedCandidates]);

	// Sync engine suggestions ref
	useEffect(() => {
		engineSuggestionsRef.current = engineCandidates;
	}, [engineCandidates]);

	// Sync completion state with loading/engineCandidates
	useEffect(() => {
		if (
			(state.mode === "COMMAND" || isMacroAuthoring) &&
			completion.status === "cycling"
		) {
			setCompletion((prev) => {
				if (prev.status !== "cycling") return prev;
				return {
					...prev,
					loading,
					engineCandidates,
					candidates: completionCandidates,
				};
			});
		}
	}, [
		loading,
		engineCandidates,
		completionCandidates,
		state.mode,
		isMacroAuthoring,
	]);

	// Sync active index with search matches
	useEffect(() => {
		if (
			searchState.open &&
			searchState.matches.length > 0 &&
			searchState.matchIndex >= 0
		) {
			const activeCellId = searchState.matches[searchState.matchIndex];
			const index = state.cells.findIndex((c) => c.cellId === activeCellId);
			if (index >= 0 && index !== state.activeIndex) {
				dispatch({ type: "set_active", index });
			}
		}
	}, [
		searchState.open,
		searchState.matches,
		searchState.matchIndex,
		state.cells,
		state.activeIndex,
		dispatch,
	]);

	const documentPort = useMemo(
		() =>
			new NotebookDocumentPort(state, dispatch, {
				nextError: notebook.nextErrorIndex,
				prevError: notebook.prevErrorIndex,
				deleteActive: () => {
					void notebook.deleteActive();
				},
				yankActive: () => {
					void notebook.yankActive();
				},
				paste: () => {
					void notebook.pasteActive();
				},
				pasteAbove: () => {
					void notebook.pasteAbove();
				},
				deleteSelection: () => {
					void notebook.deleteSelection();
				},
				yankSelection: () => {
					void notebook.yankSelection();
				},
				reverseMacro: () => {
					void notebook.reverseActiveMacro();
				},
			}),
		[state, dispatch, notebook, session],
	);

	const domainPort = useMemo(
		() =>
			new WindowDomainPort({
				runActive: () => {
					const cell = state.cells[state.activeIndex];
					if (!cell) return Promise.resolve();
					return state.runMode === "preview"
						? notebook.previewCell(cell)
						: notebook.runCell(cell);
				},
				runIndexes: async (indexes: number[]) => {
					for (const idx of indexes) {
						const cell = state.cells[idx];
						if (!cell) continue;
						if (state.runMode === "preview") await notebook.previewCell(cell);
						else await notebook.runCell(cell);
					}
				},
				runCellIds: async (cellIds: string[]) => {
					for (const id of cellIds) {
						const cell = state.cells.find((c) => c.cellId === id);
						if (!cell) continue;
						if (state.runMode === "preview") await notebook.previewCell(cell);
						else await notebook.runCell(cell);
					}
				},
				previewActive: () => {
					const cell = state.cells[state.activeIndex];
					return cell ? notebook.previewCell(cell) : Promise.resolve();
				},
				dispatchCommand: (line: string) => notebook.dispatchCommand(line),
				getActiveIndex: () => state.activeIndex,
			}),
		[state, notebook],
	);

	if (!session) return null;

	const editorState: EditorKernelState = {
		mode: state.mode as CellEditorMode,
		commandKind: state.commandKind,
		draftText: state.mode === "COMMAND" ? state.commandLine : state.draftText,
		completion,
		error: state.message ?? null,
		showHelp: showHelp || state.showHelp || overlay !== null,
		visualStart: state.visualStart,
		visualEnd: state.visualEnd,
	};

	const onOverlayAction = (action: WindowOverlayAction) => {
		switch (action) {
			case "close":
				setOverlay(null);
				if (overlay?.route === "preview") {
					const cellId = (overlay.payload as any)?.cellId;
					if (cellId) {
						dispatch({ type: "set_preview", preview: undefined });
					}
				}
				return;
			case "accept":
				if (overlay?.payload) {
					void notebook.acceptPreview(overlay.payload as any);
				}
				setOverlay(null);
				return;
			case "edit":
				setOverlay(null);
				dispatch({ type: "set_preview", preview: undefined });
				dispatch({ type: "set_mode", mode: "INSERT" });
				return;
			default:
				return;
		}
	};

	const applyScratchpadOperations = async (
		scratchOps: WorkspaceOperation[],
		targetIds: readonly string[] = [],
	): Promise<void> => {
		const existingBranches = workspace.snapshot?.branches ?? [];
		const resolvedOps: WorkspaceOperation[] = [];
		const targetBranches = existingBranches.filter((branch) =>
			targetIds.includes(branch.branchId),
		);
		const plannedEvidence = new Set<string>();

		const addFindingIfNeeded = (
			branch: (typeof existingBranches)[number],
			finding: {
				conceptId?: string;
				display: string;
				certainty: "supporting" | "refuting";
			},
		) => {
			const conceptId = (finding.conceptId ?? finding.display)
				.trim()
				.toLowerCase();
			const plannedKey = `${branch.branchId}:${finding.certainty}:${conceptId}`;
			if (plannedEvidence.has(plannedKey)) return;
			const same = (
				finding.certainty === "supporting"
					? branch.supportingConcepts
					: branch.refutingConcepts
			).some(
				(concept) =>
					(concept.conceptId ?? concept.display ?? "").toLowerCase() ===
					conceptId,
			);
			if (same) return;

			const opposite = (
				finding.certainty === "supporting"
					? branch.refutingConcepts
					: branch.supportingConcepts
			).some(
				(concept) =>
					(concept.conceptId ?? concept.display ?? "").toLowerCase() ===
					conceptId,
			);
			if (opposite) {
				resolvedOps.push({
					kind: "remove_fact",
					workspaceId:
						workspace.snapshot?.workspaceId ?? `workspace-${session.sessionId}`,
					branchId: branch.branchId,
					factId: conceptId,
					reason: "Scratchpad evidence polarity replacement",
				});
			}
			resolvedOps.push({
				kind: "add_fact",
				workspaceId:
					workspace.snapshot?.workspaceId ?? `workspace-${session.sessionId}`,
				branchId: branch.branchId,
				fact: {
					factId: finding.conceptId ?? finding.display,
					targetSchema: "ObservationEvent",
					concept: {
						conceptId,
						display: finding.display,
					},
					certainty: finding.certainty,
					provenance: {},
				},
			});
			plannedEvidence.add(plannedKey);
		};
		const normalizeFinding = (
			finding: any,
			certainty: "supporting" | "refuting",
		) => ({
			conceptId:
				finding.concept?.conceptId ?? finding.conceptId ?? finding.display,
			display: finding.concept?.display ?? finding.display,
			certainty,
		});

		const applyCrossBranchEffects = (findings: any[]) => {
			for (const finding of findings) {
				const effects = finding.crossBranchEffects ?? [];
				for (const effect of effects) {
					const targetKey = effect.targetBranch.toLowerCase();
					const targetBranch = existingBranches.find(
						(b) =>
							b.name.toLowerCase() === targetKey ||
							(b.hypothesisConcept?.conceptId ?? "").toLowerCase() ===
							targetKey ||
							b.name.toLowerCase().includes(targetKey),
					);
					if (targetBranch) {
						resolvedOps.push({
							kind: "branch_transition",
							workspaceId:
								workspace.snapshot?.workspaceId ??
								`workspace-${session.sessionId}`,
							branchId: targetBranch.branchId,
							transition: effect.transition,
						});
					}
				}
			}
		};

		for (const op of scratchOps) {
			if (op.kind === "create_branch") {
				applyCrossBranchEffects((op as any).supportingFindings ?? []);
				applyCrossBranchEffects((op as any).refutingFindings ?? []);

				if (targetBranches.length > 0) {
					for (const branch of targetBranches) {
						for (const finding of (op as any).supportingFindings ?? [])
							addFindingIfNeeded(
								branch,
								normalizeFinding(finding, "supporting"),
							);
						for (const finding of (op as any).refutingFindings ?? [])
							addFindingIfNeeded(branch, normalizeFinding(finding, "refuting"));
					}
					continue;
				}
				const conceptKey = (op.concept?.conceptId ?? op.name).toLowerCase();
				const nameKey = op.name.toLowerCase();
				const existing = existingBranches.find(
					(b) =>
						(b.hypothesisConcept?.conceptId ?? "").toLowerCase() ===
						conceptKey || b.name.toLowerCase() === nameKey,
				);

				if (existing) {
					const targetStatus = ((op as any).initialStatus ??
						"active") as keyof typeof BRANCH_STATUS_TO_TRANSITION;
					const transition = BRANCH_STATUS_TO_TRANSITION[targetStatus];
					if (transition && existing.status !== targetStatus) {
						resolvedOps.push({
							kind: "branch_transition",
							workspaceId:
								workspace.snapshot?.workspaceId ??
								`workspace-${session.sessionId}`,
							branchId: existing.branchId,
							transition,
						});
					}

					for (const f of (op as any).supportingFindings ?? [])
						addFindingIfNeeded(existing, normalizeFinding(f, "supporting"));
					for (const f of (op as any).refutingFindings ?? [])
						addFindingIfNeeded(existing, normalizeFinding(f, "refuting"));
				} else {
					resolvedOps.push(op);
				}
			} else {
				resolvedOps.push(op);
			}
		}

		if (resolvedOps.length > 0) await workspace.applyOperations(resolvedOps);
	};

	const renderOverlay = (o: WindowOverlay) => {
		if (o.route === "help") {
			const descs = catalog.getDescriptors(context);
			return (
				<HelpScreen
					editorDescriptors={descs.filter((d) => d.group === "editor") as any}
					cellDescriptors={descs.filter((d) => d.group !== "editor") as any}
					keymapProfile={session?.v2.editorKeymap}
					onClose={() => onOverlayAction("close")}
				/>
			);
		}
		if (o.route === "info") {
			const cell = state.cells[state.activeIndex];
			if (!cell) return null;
			return (
				<CellInfoPanel cell={cell} onClose={() => onOverlayAction("close")} />
			);
		}
		if (o.route === "preview") {
			const preview = (o.payload ?? state.preview) as CellPreview | undefined;
			if (!preview) return null;
			return (
				<PreviewScreen
					preview={preview}
					onAccept={() => onOverlayAction("accept")}
					onEdit={() => onOverlayAction("edit")}
					onCancel={() => onOverlayAction("close")}
				/>
			);
		}
		if (o.route === "history") {
			return (
				<HistoryOverlay
					candidates={historyEntries}
					onInsert={(command) => {
						if (command.startsWith(session.v2.syntaxProfile.macroStartToken)) {
							dispatch({
								type: "begin_edit",
								cellId: "macro-history",
								mode: "INSERT",
								commandKind: "macro",
								text: command,
							});
						} else {
							dispatch({ type: "set_command", text: command });
							dispatch({ type: "set_mode", mode: "COMMAND" });
						}
						setOverlay(null);
					}}
					onClose={() => setOverlay(null)}
				/>
			);
		}
		if (o.route === "scratchpad") {
			if (!assessmentScratchpadReady) return null;
			return (
				<RapidScratchpadOverlay
					active
					initialCells={assessmentScratchpadCells}
					createCellId={() => crypto.randomUUID()}
					onCellsChange={persistAssessmentScratchpad}
					adapter={differentialScratchpadAdapter}
					workspaceId={
						workspace.snapshot?.workspaceId ?? `workspace-${session.sessionId}`
					}
					targetBranchIds={targetBranchIds}
					targetBranchNames={targetBranches.map((branch) => branch.name)}
					targetScopeLabel={targetScopeLabel}
					syntaxProfile={session.v2.syntaxProfile}
					conceptLookup={session.v2.engine.getConceptLookup()}
					mode={state.mode}
					onModeChange={(mode) => dispatch({ type: "set_mode", mode })}
					parseDebounceMs={session.v2.ideProfile.performance.parseDebounceMs}
					onApplyOperations={applyScratchpadOperations}
					onClose={() => setOverlay(null)}
				/>
			);
		}
		return null;
	};

	const onEditorAction = async (action: EditorAction) => {
		switch (action.type) {
			case "ENTER_INSERT": {
				dispatch({
					type: "begin_edit",
					cellId: "macro-input",
					mode: "INSERT",
					commandKind: "macro",
					text: state.draftText || session.v2.syntaxProfile.macroStartToken,
				});
				return;
			}
			case "ENTER_COMMAND":
				dispatch({ type: "set_mode", mode: "COMMAND" });
				dispatch({
					type: "set_command",
					text: session?.v2.syntaxProfile.directCommandToken ?? ":",
				});
				return;
			case "ENTER_MACRO":
				dispatch({
					type: "begin_edit",
					cellId: state.cells[state.activeIndex]?.cellId ?? "macro-input",
					mode: "INSERT",
					commandKind: "macro",
					text: state.draftText || session.v2.syntaxProfile.macroStartToken,
				});
				return;
			case "INSERT_TEXT":
				dispatch({ type: "append_text", text: action.text });
				return;
			case "NEWLINE":
				dispatch({ type: "append_text", text: "\n" });
				return;
			case "BACKSPACE":
				dispatch({ type: "backspace" });
				return;
			case "MOVE_CURSOR":
				dispatch({ type: "move_cursor", delta: action.delta });
				return;
			case "CURSOR_HOME":
				dispatch({ type: "cursor_home" });
				return;
			case "CURSOR_END":
				dispatch({ type: "cursor_end" });
				return;
			case "SUBMIT_MACRO": {
				if (!isMacroAuthoring || !state.draftText.trim()) return;
				void notebook.commitMacro();
				return;
			}
			case "ENTER_VISUAL":
				if (isMacroAuthoring || focusTarget === "macro-console") {
					dispatch({
						type: "set_visual_selection",
						start: state.cursorOffset,
						end: state.cursorOffset,
					});
					dispatch({ type: "set_mode", mode: "VISUAL" });
				}
				return;
			case "EXTEND_VISUAL":
				if (state.mode === "VISUAL" && state.commandKind === "macro")
					dispatch({
						type: "set_visual_selection",
						start: state.visualStart,
						end: state.visualEnd + action.delta,
					});
				return;
			case "DELETE_VISUAL": {
				if (state.mode !== "VISUAL" || state.commandKind !== "macro") return;
				const start = Math.min(state.visualStart, state.visualEnd);
				const end = Math.max(state.visualStart, state.visualEnd);
				dispatch({
					type: "set_draft_and_cursor",
					text: state.draftText.slice(0, start) + state.draftText.slice(end),
					cursorOffset: start,
				});
				dispatch({ type: "set_mode", mode: "INSERT" });
				return;
			}
			case "YANK_VISUAL":
				if (state.mode === "VISUAL" && state.commandKind === "macro")
					dispatch({
						type: "set_message",
						message: `Selected: ${state.draftText.slice(
							Math.min(state.visualStart, state.visualEnd),
							Math.max(state.visualStart, state.visualEnd),
						)}`,
					});
				return;
			case "UNLOCK_MACRO":
				notebook.unlockActiveMacroSlot();
				return;
			case "LOCK_MACRO":
				notebook.lockActiveMacroSlot();
				return;
			case "SET_COMPLETION":
				setCompletion(action.completion);
				return;
			case "HISTORY_PREV":
				dispatch({ type: "set_message", message: undefined });
				return;
			case "HISTORY_NEXT":
				dispatch({ type: "set_message", message: undefined });
				return;
			case "COMMIT_COMPLETION":
				dispatch({
					type: isMacroAuthoring ? "set_draft" : "set_command",
					text: action.line,
				});
				return;
			case "SHOW_HELP":
				setShowHelp(action.show);
				return;
			case "SEARCH":
				if (isAssessmentNavigation) {
					assessmentSearchDispatch({
						type: "OPEN",
						query: "",
						cells: assessmentSearchItems,
					});
				} else {
					searchDispatch({ type: "OPEN", query: "", cells: state.cells });
				}
				return;
			case "OPEN_HISTORY":
				setOverlay({ route: "history" });
				return;
			case "TOGGLE_SIDEBAR":
				setSidebarOpen((open) => !open);
				return;
			case "SET_SIDEBAR_TAB":
				setSidebarOpen(true);
				setSidebarTab(action.tab);
				return;
			case "NEXT_ASSESSMENT_TAB":
				setAssessmentSubTab((tab) => (tab ? nextAssessmentSubTab(tab) : tab));
				return;
			case "PREVIOUS_ASSESSMENT_TAB":
				setAssessmentSubTab((tab) =>
					tab ? nextAssessmentSubTab(tab, -1) : tab,
				);
				return;
			case "NEXT_WORKSPACE_TAB": {
				setWorkspaceTab(nextWorkspaceTab);
				return;
			}
			case "PREVIOUS_WORKSPACE_TAB":
				setWorkspaceTab(previousWorkspaceTab);
				return;
			case "OPEN_SCRATCHPAD":
				setWorkspaceTab("assessment");
				setAssessmentSubTab("scratchpad");
				setFocusTarget("assessment-scratchpad");
				setConsoleFocused(false);
				dispatch({ type: "set_mode", mode: "NORMAL" });
				return;
			case "CANCEL":
				if (state.mode === "VISUAL" && state.commandKind === "macro") {
					dispatch({ type: "set_mode", mode: "INSERT" });
					return;
				}
				dispatch({ type: "end_edit" });
				dispatch({ type: "set_mode", mode: "NORMAL" });
				setCompletion({ status: "idle" });
				return;
		}
	};

	const scratchpadContent = assessmentScratchpadReady ? (
		<RapidScratchpadOverlay
			active={assessmentSubTab === "scratchpad"}
			initialCells={assessmentScratchpadCells}
			createCellId={() => crypto.randomUUID()}
			onCellsChange={persistAssessmentScratchpad}
			adapter={differentialScratchpadAdapter}
			workspaceId={
				workspace.snapshot?.workspaceId ?? `workspace-${session.sessionId}`
			}
			targetBranchIds={targetBranchIds}
			targetBranchNames={targetBranches.map((branch) => branch.name)}
			targetScopeLabel={targetScopeLabel}
			syntaxProfile={session.v2.syntaxProfile}
			conceptLookup={session.v2.engine.getConceptLookup()}
			mode={state.mode}
			onModeChange={(mode) => dispatch({ type: "set_mode", mode })}
			parseDebounceMs={session.v2.ideProfile.performance.parseDebounceMs}
			onApplyOperations={applyScratchpadOperations}
			onApplySuccess={(operationCount) =>
				dispatch({
					type: "set_message",
					message: t("workspace.scratchpad.applied", {
						count: operationCount,
					}),
				})
			}
			onApplyError={(message) => dispatch({ type: "set_message", message })}
			onClose={() => setAssessmentSubTab("default")}
		/>
	) : null;

	const definition = notebookWindow({
		document: documentPort,
		domain: domainPort,
		catalog,
		sessionId: session.sessionId,
		editorState,
		lastEditCellId: state.lastEditCellId,
		cellSuggestions,
		dirty: state.authoredRevision !== state.persistedAuthoredRevision,
		sessionMode: state.runMode,
		defaultSection: undefined,
		defaultSchema: undefined,
		message: state.message,
		macroSlots: notebook.macroSlots,
		activeMacroArgumentId: getActiveMacroArgumentId(
			state.draftText,
			isMacroAuthoring ? state.cursorOffset : -1,
			notebook.macroSlots,
			notebook.activeDefinition,
			session.v2.syntaxProfile,
		),
		cursorOffset: state.cursorOffset,
		syntaxProfile: session.v2.syntaxProfile,
		activeDefinition: notebook.activeDefinition,
		availablePlacements: notebook.availablePlacements,
		selectedPlacement: notebook.selectedPlacement,
		selectPlacement: notebook.selectPlacement,
		childDefinitions: notebook.childDefinitions,
		draftPreview: notebook.macroDraftPreview,
		sidebarOpen,
		sidebarTab,
		onSelectSidebarTab: setSidebarTab,
		activeHistoryCell: state.cells[state.activeIndex] ?? null,
		workspaceTab,
		assessmentSubTab: assessmentSubTab ?? undefined,
		consoleFocused,
		focusTarget,
		scratchpadContent,
		editorContent: (
			<ScratchpadEditor
				active={assessmentSubTab === "editor"}
				cells={assessmentScratchpadCells}
				macros={scratchpadMacros}
				onCellsChange={persistAssessmentScratchpad}
			/>
		),
		sectionScratchpadContent,
		sectionEditorContent,
		selectedBranchId,
		selectedBranchIds,
		assessmentSearchOpen: assessmentSearchState.open,
		assessmentSearchQuery: assessmentSearchState.query,
		historySearchQuery: searchState.query,
		historySearchOpen: searchState.open,
		historySearchMatches: searchState.matches,
		historySearchMatchIndex: searchState.matchIndex,
		workspaceSnapshot: workspace.snapshot,
		workspaceLoading: workspace.loading,
		workspaceError: workspace.error,
		workspaceFocused: workspace.focused,
		soapContent: session ? (
			<SoapWorkspace
				document={soapDocument}
				templates={soapTemplates}
				renderContext={session.v2.proseRenderContext}
				loading={soapLoading}
				error={soapError}
				sessionId={session.sessionId}
				workspaceId={workspace.snapshot?.workspaceId}
				usageStore={session.v2.proseTemplateUsageStore}
			/>
		) : null,
		patientSidebarContent: session ? (
			<PatientSidebar
				store={session.v2.patientStore}
				activePatient={session.v2.patient}
			/>
		) : null,
		soapSidebarContent: <SoapTemplateSidebar templates={soapTemplates} />,
	});

	const containerDomain = {
		run: (ctx: any) => domainPort.run(ctx, {}),
		preview: (ctx: any) => domainPort.preview(ctx),
		openWorkspace: () => {
			setActiveWindow("workspace");
			return Promise.resolve();
		},
		showInfo: () => {
			setOverlay({
				route: "info",
				originCellId: state.cells[state.activeIndex]?.cellId,
			});
			return Promise.resolve();
		},
		quit: () => {
			exit();
			return Promise.resolve();
		},
		dispatchCommand: async (line: string) => {
			const general = dispatchGeneralWindowCommand(line);
			if (general) {
				if (general.action === "quit") exit();
				if (general.action === "show_help")
					setOverlay({ route: "help", originCellId: undefined });
				if (general.action === "save" || general.action === "save_quit")
					dispatch({ type: "set_message", message: "saved" });
				if (general.action === "save_quit") exit();
				return general;
			}
			dispatch({ type: "set_command", text: line });
			await runtime.dispatchCommandLine(line);
			return { success: true };
		},
	};

	if (activeWindow === "workspace") {
		return (
			<Workspace session={session} onBack={() => setActiveWindow("notebook")} />
		);
	}

	return (
		<WindowContainer
			definition={definition}
			keymap={new NotebookKeymapPolicy(session?.v2.editorKeymap)}
			keymapProfile={session?.v2.editorKeymap}
			document={documentPort}
			domain={containerDomain as any}
			catalog={catalog}
			context={context}
			editorState={editorState}
			onEditorAction={onEditorAction}
			overlay={overlay}
			onOverlayAction={onOverlayAction}
			renderOverlay={renderOverlay}
			completionProvider={() => completionCandidates}
			macroSlots={notebook.macroSlots}
			cursorOffset={state.cursorOffset}
			syntaxProfile={session.v2.syntaxProfile}
			childDefinitions={notebook.childDefinitions}
			macroSession={notebook.macroSession}
			navigationContext={isAssessmentNavigation ? "assessment" : "history"}
			navigationSearchOpen={
				isAssessmentNavigation ? assessmentSearchState.open : searchState.open
			}
			navigationSearchQuery={
				isAssessmentNavigation ? assessmentSearchState.query : searchState.query
			}
			onNavigationSearchQuery={(query) =>
				isAssessmentNavigation
					? assessmentSearchDispatch({
						type: "UPDATE_QUERY",
						query,
						cells: assessmentSearchItems,
					})
					: searchDispatch({ type: "UPDATE_QUERY", query, cells: state.cells })
			}
			onNavigationSearchNext={() =>
				isAssessmentNavigation
					? assessmentSearchDispatch({ type: "NEXT" })
					: searchDispatch({ type: "NEXT" })
			}
			onNavigationSearchPrev={() =>
				isAssessmentNavigation
					? assessmentSearchDispatch({ type: "PREV" })
					: searchDispatch({ type: "PREV" })
			}
			onNavigationSearchSelect={() =>
				isAssessmentNavigation
					? assessmentSearchDispatch({ type: "CLOSE" })
					: searchDispatch({ type: "CLOSE" })
			}
			onNavigationSearchClose={() =>
				isAssessmentNavigation
					? assessmentSearchDispatch({ type: "CLEAR" })
					: searchDispatch({ type: "CLEAR" })
			}
			onNavigationMove={
				isAssessmentNavigation ? moveAssessmentBranch : undefined
			}
			onNavigationToggleSelection={
				isAssessmentNavigation ? toggleSelectedBranch : undefined
			}
			onNavigationSelectAll={
				isAssessmentNavigation ? selectAllBranches : undefined
			}
			onNavigationClearSelection={
				isAssessmentNavigation ? clearBranchSelection : undefined
			}
			onNavigationSearchOpen={
				isAssessmentNavigation
					? () =>
						assessmentSearchDispatch({
							type: "OPEN",
							query: "",
							cells: assessmentSearchItems,
						})
					: undefined
			}
			assessmentSubTabsActive={
				workspaceTab === "subjective" ||
				workspaceTab === "objective" ||
				workspaceTab === "assessment" ||
				workspaceTab === "plan"
			}
			focusTarget={focusTarget}
			suspendEditorInput={
				(workspaceTab === "subjective" ||
					workspaceTab === "objective" ||
					workspaceTab === "assessment" ||
					workspaceTab === "plan") &&
				assessmentSubTab === "scratchpad" &&
				!consoleFocused
			}
			onToggleConsoleFocus={toggleConsoleFocus}
			historySearchOpen={searchState.open}
			historySearchQuery={searchState.query}
			onHistorySearchQuery={(query) =>
				searchDispatch({ type: "UPDATE_QUERY", query, cells: state.cells })
			}
			onHistorySearchNext={() => searchDispatch({ type: "NEXT" })}
			onHistorySearchPrev={() => searchDispatch({ type: "PREV" })}
			onHistorySearchSelect={() => searchDispatch({ type: "CLOSE" })}
			onHistorySearchClose={() => searchDispatch({ type: "CLEAR" })}
		/>
	);
}
