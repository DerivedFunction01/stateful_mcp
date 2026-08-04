import { useApp } from "ink";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNotebook } from "../hooks/useNotebook";
import { useSession } from "../hooks/useSession";
import type {
	CellEditorMode,
	EditorAction,
	EditorKernelState,
	WindowOverlay,
	WindowOverlayAction,
} from "../lib/cell-editor";
import type { CompletionState } from "../lib/editor/completion-state";
import { useNotebookRuntime } from "../lib/runtime/notebook-runtime";
import { NotebookCommandCatalog } from "../lib/windows/notebook/catalog";
import { NotebookDocumentPort } from "../lib/windows/notebook/document";
import { WindowDomainPort } from "../lib/windows/notebook/domain";
import { NotebookKeymapPolicy } from "../lib/windows/notebook/keymap-policy";
import { notebookWindow } from "../lib/windows/notebook/window";
import { CellInfoPanel } from "./CellInfoPanel";
import { HelpScreen } from "./HelpScreen";
import { PreviewScreen } from "./PreviewScreen";
import {
	INITIAL_SEARCH_STATE,
	SearchOverlay,
	searchReducer,
} from "./SearchOverlay";
import { WindowContainer } from "./WindowContainer";
import { Workspace } from "./Workspace";

/**
 * Independent notebook root. Owns a separate useSession/useNotebook and runs
 * the notebook command path through the extension intent/effect runtime.
 */
export function Notebook() {
	const session = useSession();
	const notebook = useNotebook(session);
	const { exit } = useApp();
	const { state, dispatch, cellSuggestions, getAutocomplete } = notebook;
	const [completion, setCompletion] = useState<CompletionState>({
		status: "idle",
	});
	const [showHelp, setShowHelp] = useState(false);
	const [overlay, setOverlay] = useState<WindowOverlay | null>(null);
	const [activeWindow, setActiveWindow] = useState<"notebook" | "workspace">(
		"notebook",
	);
	const [searchState, searchDispatch] = useReducer(
		searchReducer,
		INITIAL_SEARCH_STATE,
	);
	const engineSuggestionsRef = useRef<any[]>([]);

	useEffect(() => {
		if (state.preview && !overlay) {
			setOverlay({
				route: "preview",
				payload: state.preview,
				originCellId: state.preview.cellId,
			});
		}
	}, [state.preview, overlay]);

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
		if (state.mode !== "COMMAND") return [];
		return getAutocomplete(state.commandLine.slice(1));
	}, [state.mode, state.commandLine, session?.sessionId, getAutocomplete]);

	// TODO(cli2-v2): replace the retired V1 engine/macro completion hooks with
	//  notebook autocomplete and NotebookPreviewWorkflow presentation.
	const loading = false;
	const engineCandidates: import("../lib/editor/autocomplete").AutocompleteSuggestion[] =
		[];
	const mergedCandidates = staticCandidates;

	// Sync engine suggestions ref
	useEffect(() => {
		engineSuggestionsRef.current = engineCandidates;
	}, [engineCandidates]);

	// Sync completion state with loading/engineCandidates
	useEffect(() => {
		if (
			(state.mode === "COMMAND" || state.mode === "MACRO") &&
			completion.status === "cycling"
		) {
			setCompletion((prev) => {
				if (prev.status !== "cycling") return prev;
				return {
					...prev,
					loading,
					engineCandidates,
					candidates: mergedCandidates,
				};
			});
		}
	}, [loading, engineCandidates, mergedCandidates, state.mode]);

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
				insertBelow: () => {
					void notebook.insertBelow();
				},
				insertAbove: () => {
					void notebook.insertAbove();
				},
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
		draftText: state.mode === "COMMAND" ? state.commandLine : state.draftText,
		completion,
		error: state.message ?? null,
		showHelp: showHelp || state.showHelp || overlay !== null,
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

	const renderOverlay = (o: WindowOverlay) => {
		if (o.route === "help") {
			const descs = catalog.getDescriptors(context);
			return (
				<HelpScreen
					editorDescriptors={descs.filter((d) => d.group === "editor") as any}
					cellDescriptors={descs.filter((d) => d.group !== "editor") as any}
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
			const preview = (o.payload ?? state.preview) as
				| import("@stateful-mcp/clinical/cells/cell-service-types").CellPreview
				| undefined;
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
		if (o.route === "search") {
			return (
				<SearchOverlay
					query={searchState.query}
					matchIndex={searchState.matchIndex}
					matchCount={searchState.matches.length}
					onChangeQuery={(query) =>
						searchDispatch({ type: "UPDATE_QUERY", query, cells: state.cells })
					}
					onNext={() => searchDispatch({ type: "NEXT" })}
					onPrev={() => searchDispatch({ type: "PREV" })}
					onSelect={() => {
						if (searchState.matches.length > 0 && searchState.matchIndex >= 0) {
							const activeCellId = searchState.matches[searchState.matchIndex];
							const index = state.cells.findIndex(
								(c) => c.cellId === activeCellId,
							);
							if (index >= 0) {
								dispatch({ type: "set_active", index });
							}
						}
						setOverlay(null);
					}}
					onClose={() => {
						searchDispatch({ type: "CLEAR" });
						setOverlay(null);
					}}
				/>
			);
		}
		return null;
	};

	const onEditorAction = (action: EditorAction) => {
		switch (action.type) {
			case "ENTER_INSERT":
				dispatch({ type: "set_mode", mode: "INSERT" });
				return;
			case "ENTER_COMMAND":
				dispatch({ type: "set_mode", mode: "COMMAND" });
				return;
			case "ENTER_MACRO":
				dispatch({ type: "set_mode", mode: "MACRO" });
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
			case "SUBMIT_MACRO": {
				if (state.mode !== "MACRO" || !state.draftText.trim()) return;
				void notebook.createCell(state.draftText).then((macroCell) => {
					if (!macroCell) return;
					dispatch({ type: "set_mode", mode: "NORMAL" });
					void notebook.runCell(macroCell);
				});
				return;
			}
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
					type: state.mode === "MACRO" ? "set_draft" : "set_command",
					text: action.line,
				});
				return;
			case "SHOW_HELP":
				setShowHelp(true);
				return;
			case "SEARCH":
				setOverlay({ route: "search" });
				searchDispatch({ type: "OPEN", query: "", cells: state.cells });
				return;
			case "CANCEL":
				dispatch({ type: "set_mode", mode: "NORMAL" });
				setCompletion({ status: "idle" });
				return;
		}
	};

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
		macroSuggestions: mergedCandidates,
		syntaxProfile: session.v2.syntaxProfile,
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
			keymap={new NotebookKeymapPolicy()}
			document={documentPort}
			domain={containerDomain as any}
			catalog={catalog}
			context={context}
			editorState={editorState}
			onEditorAction={onEditorAction}
			overlay={overlay}
			onOverlayAction={onOverlayAction}
			renderOverlay={renderOverlay}
			completionProvider={() => mergedCandidates}
		/>
	);
}
