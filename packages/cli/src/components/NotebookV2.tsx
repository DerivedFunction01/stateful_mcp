import { useApp } from "ink";
import { useMemo, useState } from "react";
import { useNotebook } from "../hooks/useNotebook";
import { useSession } from "../hooks/useSession";
import type {
	CellEditorMode,
	EditorAction,
	EditorKernelState,
	WindowOverlay,
	WindowOverlayAction,
} from "../lib/cell-editor";
import type { CompletionState } from "../lib/completion-state";
import { NotebookCommandCatalog } from "../lib/notebook-catalog";
import { NotebookDocumentPort } from "../lib/notebook-document";
import { WindowDomainPort } from "../lib/notebook-domain";
import { NotebookKeymapPolicy } from "../lib/notebook-keymap-policy";
import { notebookWindow } from "../lib/notebook-window";
import { useNotebookRuntime } from "../lib/use-notebook-runtime";
import { CellInfoPanel } from "./CellInfoPanel";
import { HelpScreen } from "./HelpScreen";
import { PreviewScreen } from "./PreviewScreen";
import { WindowContainer } from "./v2/WindowContainer";
import { WorkspaceV2 } from "./WorkspaceV2";

/**
 * Independent v2 notebook root. Owns a separate useSession/useNotebook and runs
 * the notebook command path through the extension intent/effect runtime.
 */
export function NotebookV2() {
	const session = useSession();
	const notebook = useNotebook(session);
	const { exit } = useApp();
	const { state, dispatch } = notebook;
	const [completion, setCompletion] = useState<CompletionState>({
		status: "idle",
	});
	const [showHelp, setShowHelp] = useState(false);
	const [overlay, setOverlay] = useState<WindowOverlay | null>(null);
	const [activeWindow, setActiveWindow] = useState<"notebook" | "workspace">(
		"notebook",
	);

	const cellDescriptors = useMemo(
		() => ({
			getDescriptors: () =>
				((
					session?.result.processor as any
				)?.cellCommandRegistry?.getDescriptors?.() as any[]) ?? [],
		}),
		[session],
	);

	const runtime = useNotebookRuntime({
		sessionId: session?.sessionId ?? "",
		notebook,
		cellDescriptors,
		onCommandResultAccepted: () => {
			setCompletion({ status: "idle" });
			setShowHelp(false);
			dispatch({ type: "EXIT_COMMAND_MODE" });
		},
		onAppQuit: () => exit(),
		onMessage: (message) => dispatch({ type: "SET_MESSAGE", message }),
		onOpenOverlay: (route, payload) => {
			setOverlay((prev) => {
				const originCellId =
					route === "info" || route === "preview"
						? state.cells[state.activeIndex]?.cellId
						: undefined;
				return { route, payload, originCellId };
			});
		},
		onCloseOverlay: () => setOverlay(null),
		onSwitchWindow: (windowKind) => {
			if (windowKind === "workspace" || windowKind === "notebook") {
				setActiveWindow(windowKind);
			}
		},
	});

	const documentPort = useMemo(
		() =>
			new NotebookDocumentPort(state, dispatch, {
				insertBelow: () => notebook.insertBelow(session?.sessionId ?? ""),
				insertAbove: () => notebook.insertAbove(session?.sessionId ?? ""),
			}),
		[state, dispatch, notebook, session],
	);

	const domainPort = useMemo(
		() =>
			new WindowDomainPort({
				runActive: () => {
					const cell = state.cells[state.activeIndex];
					return cell ? notebook.runCell(cell) : Promise.resolve();
				},
				runIndexes: async (indexes: number[]) => {
					for (const idx of indexes) {
						const cell = state.cells[idx];
						if (cell) await notebook.runCell(cell);
					}
				},
				runCellIds: async (cellIds: string[]) => {
					for (const id of cellIds) {
						const cell = state.cells.find((c) => c.cellId === id);
						if (cell) await notebook.runCell(cell);
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

	const context = {
		hostKind: "notebook",
		collection: { kind: "notebook" as const, collectionId: session.sessionId },
		sessionId: session.sessionId,
	};
	const scope = {
		windowKind: "notebook",
		sessionId: session.sessionId,
		collection: { kind: "notebook" as const, collectionId: session.sessionId },
	};
	const editorState: EditorKernelState = {
		mode: state.mode as CellEditorMode,
		draftText: state.mode === "COMMAND" ? state.commandLine : state.draftText,
		completion,
		error: state.message,
		showHelp: showHelp || state.showHelp || overlay !== null,
	};

	const catalog = new NotebookCommandCatalog(
		runtime.runtime.catalog.descriptors(scope),
		(partial) =>
			runtime.runtime.catalog.suggestions(partial, runtime.runtime.scope),
	);

	const onOverlayAction = (action: WindowOverlayAction) => {
		switch (action) {
			case "close":
				setOverlay(null);
				if (overlay?.route === "preview") {
					const cellId = (overlay.payload as any)?.cellId;
					if (cellId) {
						dispatch({
							type: "UPDATE_CELL",
							cellId,
							updater: (c) => ({ ...c, status: "draft" as const }),
						});
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
				dispatch({ type: "CLEAR_PREVIEW" });
				dispatch({ type: "ENTER_INSERT_MODE" });
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
				<CellInfoPanel
					cell={cell as any}
					onClose={() => onOverlayAction("close")}
				/>
			);
		}
		if (o.route === "preview") {
			const candidate = (o.payload ?? state.preview) as any;
			if (!candidate) return null;
			return (
				<PreviewScreen
					candidate={candidate}
					onAccept={() => onOverlayAction("accept")}
					onEdit={() => onOverlayAction("edit")}
					onCancel={() => onOverlayAction("close")}
				/>
			);
		}
		return null;
	};

	const onEditorAction = (action: EditorAction) => {
		switch (action.type) {
			case "ENTER_INSERT":
				dispatch({ type: "ENTER_INSERT_MODE" });
				return;
			case "ENTER_COMMAND":
				dispatch({ type: "ENTER_COMMAND_MODE" });
				return;
			case "INSERT_TEXT":
				if (state.mode === "COMMAND")
					dispatch({ type: "COMMAND_APPEND", char: action.text });
				else dispatch({ type: "TYPE_CHAR", char: action.text });
				return;
			case "NEWLINE":
				dispatch({ type: "TYPE_CHAR", char: "\n" });
				return;
			case "BACKSPACE":
				if (state.mode === "COMMAND") dispatch({ type: "COMMAND_BACKSPACE" });
				else dispatch({ type: "BACKSPACE" });
				return;
			case "SET_COMPLETION":
				setCompletion(action.completion);
				return;
			case "COMMIT_COMPLETION":
				dispatch({ type: "COMMAND_SET", text: action.line });
				return;
			case "SHOW_HELP":
				setShowHelp(true);
				return;
			case "CANCEL":
				if (state.mode === "COMMAND") dispatch({ type: "EXIT_COMMAND_MODE" });
				else if (state.mode === "INSERT")
					dispatch({ type: "EXIT_INSERT_MODE" });
				else if (state.mode === "VISUAL")
					dispatch({ type: "EXIT_VISUAL_MODE" });
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
			await runtime.dispatchCommandLine(line);
			return { success: true };
		},
	};

	if (activeWindow === "workspace") {
		return (
			<WorkspaceV2
				session={session}
				onBack={() => setActiveWindow("notebook")}
			/>
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
		/>
	);
}
