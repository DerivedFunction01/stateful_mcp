import {
	type EditorOperation,
	type EditorOperationResult,
	LAYOUT_RATIO_BOUNDS,
	type SearchDirection,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { CircleDot } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useEditorDraftSync } from "../hooks/useEditorDraftSync";
import { useEditorSurfaceRegistration } from "../hooks/useEditorSurfaceRegistration";
import { useWorkbenchLayout } from "../hooks/useWorkbenchLayout";
import { useWorkbenchVim } from "../hooks/useWorkbenchVim";
import { useI18n } from "../lib/macro-i18n-provider";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import { getEditorSurfaceAdapter } from "./EditorSurfaceView";
import { Splitter } from "./Splitter";
import { EditorCanvas } from "./workbench/EditorCanvas";
import { EditorGroupHeader } from "./workbench/EditorGroupHeader";
import { PrimarySidebar } from "./workbench/PrimarySidebar";
import { WorkbenchDockedInspector } from "./workbench/WorkbenchDockedInspector";

export interface WorkbenchShellProps {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly editorDrafts: Readonly<Record<string, readonly string[]>>;
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localLines: readonly string[];
		readonly result: EditorOperationResult;
	};
	readonly editorResult?: EditorOperationResult;
	readonly pendingEditorRequests: Readonly<Record<string, string>>;
	readonly editorError?: { readonly code?: string; readonly message: string };
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
	readonly onSetEditorDraft: (
		documentId: string,
		lines: readonly string[],
	) => void;
	readonly onReloadEditorConflict: () => void | Promise<void>;
	readonly onOverwriteEditorConflict: () => void;
	readonly onEditorCursorChange?: (cursor: string) => void;
	readonly onOpenPalette?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (direction: SearchDirection) => void;
	readonly searchWidget?: ReactNode;
	readonly activePrimaryTab?: import("./ActivityRail").PrimarySidebarTab;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
}

export function WorkbenchShell({
	snapshot,
	status = "loading",
	errorMessage,
	onCommand,
	editorDrafts,
	editorConflict,
	editorResult,
	pendingEditorRequests,
	onEditorOperation,
	onSetEditorDraft,
	onReloadEditorConflict,
	onOverwriteEditorConflict,
	onEditorCursorChange,
	onOpenPalette,
	onOpenSearch,
	searchWidget,
	activePrimaryTab = "explorer",
	onOpenFolderModal,
}: WorkbenchShellProps) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	const [surfaceFocused, setSurfaceFocused] = useState(false);
	const [vimNotice] = useState<string>();

	const surfaceRef = useRef<HTMLElement | null>(null);
	const shellRef = useRef<HTMLDivElement | null>(null);
	const snapshotRef = useRef(snapshot);
	snapshotRef.current = snapshot;
	const onSetEditorDraftRef = useRef(onSetEditorDraft);
	onSetEditorDraftRef.current = onSetEditorDraft;

	const activeDocument = snapshot?.editor.activeDocument;
	const activeDocumentMeta = snapshot?.editor.documents.find(
		(document) => document.documentId === snapshot?.editor.activeDocumentId,
	);

	const getSurfaceAdapter = useCallback(() => {
		const element = surfaceRef.current;
		if (!element) return undefined;
		const currentSnapshot = snapshotRef.current;
		const currentDocument = currentSnapshot?.editor.activeDocument;
		const currentDocumentMeta = currentSnapshot?.editor.documents.find(
			(document) =>
				document.documentId === currentSnapshot?.editor.activeDocumentId,
		);
		return getEditorSurfaceAdapter(
			element,
			(text) => {
				if (currentDocumentMeta)
					onSetEditorDraftRef.current(currentDocumentMeta.documentId, text);
			},
			{
				documentId: currentDocument?.documentId,
				textRevision: currentDocument?.textRevision,
			},
		);
	}, []);

	const {
		inspectorPosition,
		isInspectorOpen,
		isSidebarOpen,
		toggleInspector,
		setInspectorPosition,
		sidebarRatio,
		inspectorRatio,
		totalFr,
		shellStyle,
	} = useWorkbenchLayout(snapshot, onCommand);

	const { vimController, vimState, toggleVim } = useWorkbenchVim({
		snapshotRef,
		getSurfaceAdapter,
		onOpenPalette,
		onOpenSearch,
		onEditorOperation,
	});

	const {
		localDraft,
		activeLines,
		flushDraft,
		clearDraftTimer,
		handleInsertSnippet,
	} = useEditorDraftSync({
		activeDocument,
		activeDocumentMeta,
		editorDrafts,
		onEditorOperation,
		onSetEditorDraft,
		activeCellIndex: vimState.enabled ? vimState.activeCellIndex : undefined,
	});

	useEditorSurfaceRegistration({
		snapshot,
		surfaceRef,
		surfaceFocused,
		vimState,
		vimController,
		getSurfaceAdapter,
	});

	if (status === "error") {
		return (
			<section className="workbench-state" aria-live="assertive">
				<strong>{t("workbench.unavailable")}</strong>
				<p>{errorMessage ?? t("common.error")}</p>
			</section>
		);
	}

	if (!snapshot) {
		return (
			<section className="workbench-state" aria-live="polite">
				<CircleDot size={28} />
				<strong>{t("common.loading")}</strong>
			</section>
		);
	}

	const activeDomainId = activeDomain ?? snapshot.applications[0]?.id;
	const activeGroup = snapshot.editor.groups.find(
		(group) => group.groupId === snapshot.editor.activeGroupId,
	);
	const activeGroupDocuments = activeGroup
		? snapshot.editor.documents.filter((document) =>
				activeGroup.documentIds.includes(document.documentId),
			)
		: snapshot.editor.documents;
	const activeView = snapshot.contributions.views.find(
		(view) => view.containerId === snapshot.layout.activeContainerId,
	);
	const pendingEditor = activeDocumentMeta
		? pendingEditorRequests[activeDocumentMeta.documentId] !== undefined
		: false;

	const requestId = () => crypto.randomUUID();
	const emitEditorOperation = (operation: EditorOperation) => {
		void onEditorOperation(operation);
	};

	const openDocumentInActiveGroup = (documentId: string) => {
		if (!activeGroup) return;
		emitEditorOperation({
			operation: "editor.openDocumentInGroup",
			requestId: requestId(),
			groupId: activeGroup.groupId,
			documentId,
			expectedWorkspaceRevision: snapshot.revision,
		});
	};

	const inspectorSplitter = isInspectorOpen ? (
		<Splitter
			orientation="vertical"
			region="inspector"
			label={t("workbench.resizeInspector")}
			value={inspectorRatio}
			min={LAYOUT_RATIO_BOUNDS.min}
			max={LAYOUT_RATIO_BOUNDS.max}
			step={0.02}
			totalFr={totalFr}
			containerRef={shellRef}
			invertDelta={inspectorPosition === "right"}
			onChange={(next) =>
				onCommand("layout.setRegionWidthRatio", [
					{ region: "inspector", ratio: next },
				])
			}
		/>
	) : null;

	const inspectorElement = (
		<WorkbenchDockedInspector
			document={snapshot.editor.activeDocument}
			meta={activeDocumentMeta}
			activeLineIndex={vimState.enabled ? vimState.activeCellIndex : undefined}
			pinnedMacros={snapshot.contributions?.pinnedMacros}
			isOpen={isInspectorOpen}
			onToggleOpen={toggleInspector}
			dockPosition={inspectorPosition}
			onToggleDockPosition={() =>
				setInspectorPosition(inspectorPosition === "right" ? "left" : "right")
			}
			onPin={(macroId) =>
				activeDocument &&
				macroId !== null &&
				emitEditorOperation({
					operation: "editor.pinMacro",
					requestId: requestId(),
					documentId: activeDocument.documentId,
					macroId,
				})
			}
			onJumpToLine={(lineNumber) => {
				vimController.setActiveCell(
					lineNumber - 1,
					Math.max(1, activeLines.length),
				);
			}}
			onInsertSnippet={handleInsertSnippet}
		/>
	);

	return (
		<div className="workbench-shell" ref={shellRef} style={shellStyle}>
			{inspectorPosition === "left" && (
				<>
					{inspectorElement}
					{inspectorSplitter}
				</>
			)}

			{isSidebarOpen && (
				<>
					<PrimarySidebar
						activeTab={activePrimaryTab}
						snapshot={snapshot}
						documents={snapshot.editor.documents}
						activeDocumentId={snapshot.editor.activeDocumentId}
						isOpen={isSidebarOpen}
						onSelectDocument={(documentId) => {
							if (localDraft !== undefined) {
								flushDraft();
								return;
							}
							if (
								activeGroup &&
								!activeGroup.documentIds.includes(documentId)
							) {
								openDocumentInActiveGroup(documentId);
							} else {
								emitEditorOperation({
									operation: "editor.selectDocument",
									requestId: requestId(),
									documentId,
								});
							}
						}}
						onCloseDocument={(documentId, textRevision) => {
							if (localDraft !== undefined) {
								flushDraft();
								return;
							}
							emitEditorOperation({
								operation: "editor.closeDocument",
								requestId: requestId(),
								documentId,
								expectedTextRevision: textRevision,
								force: false,
							});
						}}
						onNewScratchpad={() =>
							emitEditorOperation({
								operation: "editor.newScratchpad",
								requestId: requestId(),
							})
						}
						activeDocumentLines={activeLines}
						onJumpToLine={(lineNumber, col) => {
							vimController.setActiveCell(
								lineNumber - 1,
								Math.max(1, activeLines.length),
							);
							getSurfaceAdapter()?.jumpToMatch?.(lineNumber - 1, col ?? 0);
						}}
						onReplace={(query, replacement) => {
							getSurfaceAdapter()?.replaceCurrentMatch?.(query, replacement);
						}}
						onReplaceAll={(query, replacement) => {
							getSurfaceAdapter()?.replaceAllMatches?.(query, replacement);
						}}
						onOpenFolderModal={onOpenFolderModal}
						onCommand={onCommand}
					/>

					<Splitter
						orientation="vertical"
						region="sidebar"
						label={t("workbench.resizeSidebar")}
						value={sidebarRatio}
						min={LAYOUT_RATIO_BOUNDS.min}
						max={LAYOUT_RATIO_BOUNDS.max}
						step={0.02}
						totalFr={totalFr}
						containerRef={shellRef}
						onChange={(next) =>
							onCommand("layout.setRegionWidthRatio", [
								{ region: "activity", ratio: next },
							])
						}
					/>
				</>
			)}

			<section className="workbench-center">
				<EditorGroupHeader
					documents={activeGroupDocuments}
					activeDocumentId={snapshot.editor.activeDocumentId}
					activeDocument={activeDocument}
					canUseVim={snapshot.editor.capabilities.canUseVim}
					vimEnabled={vimState.enabled}
					canSplit={snapshot.editor.capabilities.canSplit}
					pendingEditor={pendingEditor}
					hasConflict={Boolean(editorConflict)}
					hasDraft={localDraft !== undefined}
					pinnedMacros={snapshot.contributions?.pinnedMacros}
					onSelectDocument={(documentId) => {
						if (localDraft !== undefined) {
							flushDraft();
							return;
						}
						if (activeGroup && !activeGroup.documentIds.includes(documentId)) {
							openDocumentInActiveGroup(documentId);
						} else {
							emitEditorOperation({
								operation: "editor.selectDocument",
								requestId: requestId(),
								documentId,
							});
						}
					}}
					onRenameDocument={(documentId, title) => {
						emitEditorOperation({
							operation: "editor.renameDocument",
							requestId: requestId(),
							documentId,
							title,
						});
					}}
					onCloseDocument={(documentId, textRevision) => {
						if (localDraft !== undefined) {
							flushDraft();
							return;
						}
						emitEditorOperation({
							operation: "editor.closeDocument",
							requestId: requestId(),
							documentId,
							expectedTextRevision: textRevision,
							force: false,
						});
					}}
					onNewScratchpad={() =>
						emitEditorOperation({
							operation: "editor.newScratchpad",
							requestId: requestId(),
						})
					}
					onToggleVim={toggleVim}
					onSplitGroup={() =>
						emitEditorOperation({
							operation: "editor.createSplitGroup",
							requestId: requestId(),
							sourceGroupId: activeGroup?.groupId,
							documentId: activeDocument?.documentId,
							expectedWorkspaceRevision: snapshot.revision,
						})
					}
					onExecuteValidLines={() => {
						if (!activeDocument) return;
						emitEditorOperation({
							operation: "editor.executeValidLines",
							requestId: requestId(),
							documentId: activeDocument.documentId,
							expectedTextRevision: activeDocument.textRevision,
						});
					}}
					onClearExecutedLines={() => {
						if (!activeDocument) return;
						emitEditorOperation({
							operation: "editor.clearExecutedLines",
							requestId: requestId(),
							documentId: activeDocument.documentId,
							expectedTextRevision: activeDocument.textRevision,
						});
					}}
					onResetExecutionState={() => {
						if (!activeDocument) return;
						emitEditorOperation({
							operation: "editor.resetExecutionState",
							requestId: requestId(),
							documentId: activeDocument.documentId,
						});
					}}
					onInsertSnippet={handleInsertSnippet}
				/>

				{vimNotice && (
					<div className="editor-vim-notice" role="status">
						{vimNotice}
					</div>
				)}

				<EditorCanvas
					activeDocument={activeDocument}
					activeDocumentMeta={activeDocumentMeta}
					localDraft={localDraft}
					activeLines={activeLines}
					editorConflict={editorConflict}
					vimEnabled={vimState.enabled}
					vimMode={vimState.mode}
					activeCellIndex={
						vimState.enabled ? vimState.activeCellIndex : undefined
					}
					selectedCellRange={vimState.enabled ? vimState.visualRange : null}
					searchWidget={searchWidget}
					surfaceRef={surfaceRef}
					onTextChange={(lines) =>
						activeDocumentMeta &&
						onSetEditorDraft(activeDocumentMeta.documentId, lines)
					}
					onFocusChange={(focused) => {
						setSurfaceFocused(focused);
						if (focused && vimState.mode === "COMMAND")
							vimController.exitCommandMode();
						if (!focused) {
							clearDraftTimer();
							flushDraft();
						}
					}}
					onCursorChange={(cursor) => {
						onEditorCursorChange?.(cursor);
						if (vimState.enabled && vimState.mode !== "INSERT") return;
						const line = Number.parseInt(cursor.split(":")[0] ?? "", 10);
						const column = Number.parseInt(cursor.split(":")[1] ?? "", 10);
						if (Number.isFinite(line))
							vimController.setActiveCell(
								line - 1,
								Math.max(1, activeLines.length),
								Number.isFinite(column) ? column - 1 : undefined,
							);
					}}
					onKeyDown={(event) => vimController.handleKeyDown(event)}
					onPointerTarget={(lineIndex, column, dragging) =>
						vimController.setPointerTarget(
							lineIndex,
							Math.max(1, activeLines.length),
							column,
							dragging,
						)
					}
					onExecuteLine={(lineNumber) =>
						activeDocument &&
						emitEditorOperation({
							operation: "editor.executeLine",
							requestId: requestId(),
							documentId: activeDocument.documentId,
							lineNumber,
							expectedTextRevision: activeDocument.textRevision,
						})
					}
					onExecuteRange={(startLine, endLine) =>
						activeDocument &&
						emitEditorOperation({
							operation: "editor.executeRange",
							requestId: requestId(),
							documentId: activeDocument.documentId,
							startLine,
							endLine,
							expectedTextRevision: activeDocument.textRevision,
						})
					}
					onPinMacro={(macroId) =>
						activeDocument &&
						macroId !== null &&
						emitEditorOperation({
							operation: "editor.pinMacro",
							requestId: requestId(),
							documentId: activeDocument.documentId,
							macroId,
						})
					}
					onReloadEditorConflict={onReloadEditorConflict}
					onOverwriteEditorConflict={onOverwriteEditorConflict}
				/>

				<EditorOutputDrawer
					output={snapshot.editor.output}
					result={editorResult}
					onReverseEntry={(entryId: string) =>
						onCommand("journal.reverseEntry", [{ entryId }])
					}
				/>
			</section>

			{inspectorPosition === "right" && (
				<>
					{inspectorSplitter}
					{inspectorElement}
				</>
			)}
		</div>
	);
}
