import { useApp } from "ink";
import { useMemo, useReducer, useState } from "react";
import type { SessionState } from "../hooks/useSession";
import { useWorkspace } from "../hooks/useWorkspace";
import type {
	CellEditorMode,
	EditorAction,
	EditorKernelState,
	WindowOverlay,
	WindowOverlayAction,
} from "../lib/cell-editor";
import {
	createEditorKernelState,
	reduceEditorKernel,
} from "../lib/cell-editor";
import type { CompletionState } from "../lib/editor/completion-state";
import { WindowDomainPort } from "../lib/windows/notebook/domain";
import { dispatchGeneralWindowCommand } from "../lib/windows/notebook/extension";
import { useWorkspaceRuntime } from "../lib/runtime/workspace-runtime";
import { WorkspaceDocumentPort } from "../lib/windows/workspace/document";
import { WorkspaceKeymapPolicy } from "../lib/windows/workspace/keymap-policy";
import { workspaceWindow } from "../lib/windows/workspace/window";
import { CellInfoPanel } from "./CellInfoPanel";
import { HelpScreen } from "./HelpScreen";
import { WindowContainer } from "./WindowContainer";

interface WorkspaceProps {
	session: SessionState;
	onBack(): void;
}

/**
 * The workspace window, hosted by the shared `WindowContainer`. Owns its own
 * editor kernel (mode/draft), document port (from the snapshot), domain port,
 * and workspace runtime — independent state from the notebook, sharing the host
 * infrastructure. `WorkspaceScreen` (v1) is intentionally not embedded here.
 */
export function Workspace({ session, onBack }: WorkspaceProps) {
	const { exit } = useApp();
	const workspace = useWorkspace({
		showWorkspace: true,
		sessionId: session.sessionId,
		soapNoteId: session.sessionId,
		session,
	});
	const [wsEditor, wsDispatch] = useReducer(
		reduceEditorKernel,
		undefined,
		createEditorKernelState,
	);
	const [completion, setCompletion] = useState<CompletionState>({
		status: "idle",
	});
	const [overlay, setOverlay] = useState<WindowOverlay | null>(null);
	const [, bumpDocument] = useState(0);

	const profile = session.result.engine.getParser().getProfile();

	const handleWorkspaceCommand = useMemo(() => {
		return async (
			line: string,
		): Promise<{
			success: boolean;
			message?: string;
			action?: string;
			data?: unknown;
		}> => {
			const trimmed = line.trim();
			const tokens = trimmed.split(/\s+/);
			const enteredVerb = tokens[0] ?? "";
			// Resolve any alias → canonical workspace verb so locale aliases reach
			// the switch. Editor/navigation verbs (q, w, help, back, ...) fall
			// through unchanged to the editor registry / switch below.
			const canonical =
				profile.workspaceCommandMappings?.[enteredVerb.toLowerCase()] ??
				enteredVerb;
			const rest = tokens.slice(1);
			const general = dispatchGeneralWindowCommand(trimmed);
			if (general) return general;
			switch (canonical) {
				case "focus":
					if (rest[0]) {
						await workspace.focusBranch(rest[0]);
						return { success: true };
					}
					workspace.toggleFocus();
					return { success: true };
				case "branch":
					if (rest[0] && rest[1]) {
						await workspace.addBranch(rest[0], rest.slice(1).join(" "));
						return { success: true };
					}
					return {
						success: false,
						message: "usage: :branch <name> <concept>",
					};
				case "complete":
					if (rest[0]) {
						await workspace.complete(rest[0]);
						return { success: true };
					}
					return {
						success: false,
						message: "usage: :complete <branch>",
					};
				case "close":
					await workspace.close();
					return { success: true, message: "workspace close requested" };
				case "back":
				case "exit":
					return {
						success: true,
						action: "switch_window",
						data: { windowKind: "notebook" },
					};
				case "help":
					return { success: true, action: "show_help" };
				default:
					return {
						success: false,
						message: `unknown workspace command: ${enteredVerb}`,
					};
			}
		};
	}, [workspace, profile]);

	const runtime = useWorkspaceRuntime({
		sessionId: session.sessionId,
		profile,
		snapshot: workspace.snapshot,
		onCommand: handleWorkspaceCommand,
		onCommandResultAccepted: () => {
			setCompletion({ status: "idle" });
			wsDispatch({ type: "CANCEL" });
		},
		onAppQuit: () => exit(),
		onMessage: (message) => wsDispatch({ type: "SET_ERROR", error: message }),
		onOpenOverlay: (route, payload) =>
			setOverlay((prev) => {
				const originCellId =
					route === "info" || route === "preview"
						? workspace.snapshot?.cells[
								Math.max(0, (workspace.snapshot?.cells.length ?? 1) - 1)
							]?.cellId
						: undefined;
				return { route, payload, originCellId };
			}),
		onCloseOverlay: () => setOverlay(null),
		onSwitchWindow: (windowKind) => {
			if (windowKind === "notebook") onBack();
		},
	});

	const cells = workspace.snapshot?.cells ?? [];
	const documentPort = useMemo(
		() =>
			new WorkspaceDocumentPort(
				{
					collection: { kind: "workspace", collectionId: session.sessionId },
					onChange: () => bumpDocument((value) => value + 1),
				},
				() => cells,
				() => Math.max(0, cells.length - 1),
			),
		[cells, session.sessionId],
	);

	const domainPort = useMemo(
		() =>
			new WindowDomainPort({
				runActive: async () => {
					const text = wsEditor.draftText.trim();
					if (!text) return;
					await workspace.submitPlan(workspace.planSubmission(text));
					wsDispatch({ type: "CANCEL" });
				},
				runIndexes: async () => {},
				runCellIds: async () => {},
				previewActive: async () => {},
				dispatchCommand: async (line) => {
					await runtime.dispatchCommandLine(line);
					return { success: true };
				},
				getActiveIndex: () => Math.max(0, cells.length - 1),
				showInfo: async () => setOverlay({ route: "info" }),
				quit: async () => exit(),
			}),
		[runtime, wsEditor.draftText, workspace, cells, exit],
	);

	const context = {
		hostKind: "workspace",
		collection: {
			kind: "workspace" as const,
			collectionId: workspace.snapshot?.workspaceId ?? session.sessionId,
		},
		sessionId: session.sessionId,
		activeBranchId: workspace.snapshot?.activeBranchId ?? undefined,
	};
	const scope = {
		windowKind: "workspace",
		sessionId: session.sessionId,
		collection: {
			kind: "workspace" as const,
			collectionId: workspace.snapshot?.workspaceId ?? session.sessionId,
		},
	};

	const wsCatalog = workspace.commandCatalog;

	const editorState: EditorKernelState = {
		mode: wsEditor.mode as CellEditorMode,
		draftText: wsEditor.draftText,
		completion,
		error: wsEditor.error,
		showHelp: wsEditor.showHelp || overlay !== null,
	};

	const onWorkspaceEditorAction = (action: EditorAction) => {
		if (action.type === "CANCEL") documentPort.clearSelection();
		switch (action.type) {
			case "SET_COMPLETION":
				setCompletion(action.completion);
				return;
			default:
				wsDispatch(action);
				return;
		}
	};

	const onOverlayAction = (action: WindowOverlayAction) => {
		if (action === "close") setOverlay(null);
	};

	const renderOverlay = (o: WindowOverlay) => {
		if (o.route === "help") {
			const descs = wsCatalog.getDescriptors(context);
			return (
				<HelpScreen
					editorDescriptors={descs.filter((d) => d.group === "editor") as any}
					cellDescriptors={descs.filter((d) => d.group !== "editor") as any}
					onClose={() => setOverlay(null)}
				/>
			);
		}
		if (o.route === "info") {
			const cell = cells[Math.max(0, cells.length - 1)];
			if (!cell) return null;
			return (
				<CellInfoPanel cell={cell as any} onClose={() => setOverlay(null)} />
			);
		}
		return null;
	};

	const definition = workspaceWindow({
		document: documentPort,
		domain: domainPort,
		catalog: wsCatalog,
		sessionId: session.sessionId,
		editorState,
		snapshot: workspace.snapshot,
		loading: workspace.loading,
		error: workspace.error,
		focused: workspace.focused,
		lastEditCellId: null,
	});

	const containerDomain = {
		run: (ctx: any) => domainPort.run(ctx, {}),
		preview: (ctx: any) => domainPort.preview(ctx),
		openWorkspace: () => Promise.resolve(),
		showInfo: () => setOverlay({ route: "info" }),
		quit: () => {
			exit();
			return Promise.resolve();
		},
		dispatchCommand: async (line: string) => {
			await runtime.dispatchCommandLine(line);
			return { success: true };
		},
	};

	return (
		<WindowContainer
			definition={definition}
			keymap={new WorkspaceKeymapPolicy()}
			document={documentPort}
			domain={containerDomain as any}
			catalog={wsCatalog}
			context={context}
			editorState={editorState}
			onEditorAction={onWorkspaceEditorAction}
			overlay={overlay}
			onOverlayAction={onOverlayAction}
			renderOverlay={renderOverlay}
		/>
	);
}
