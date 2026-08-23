import {
	type EditorOperation,
	type EditorOperationResult,
	LAYOUT_RATIO_BOUNDS,
	type SearchDirection,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { CircleDot } from "lucide-react";
import {
	Fragment,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useEditorDraftSync } from "../hooks/useEditorDraftSync";
import { useEditorSurfaceRegistration } from "../hooks/useEditorSurfaceRegistration";
import { useWorkbenchLayout } from "../hooks/useWorkbenchLayout";
import { useWorkbenchVim } from "../hooks/useWorkbenchVim";
import { useI18n } from "../lib/macro-i18n-provider";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import { getEditorSurfaceAdapter } from "./EditorSurfaceView";
import { Splitter } from "./Splitter";
import {
	CloseDirtyDialog,
	type PendingCloseDocument,
} from "./workbench/CloseDirtyDialog";
import { EditorCanvas } from "./workbench/EditorCanvas";
import { EditorGroupHeader } from "./workbench/EditorGroupHeader";
import { PrimarySidebar } from "./workbench/PrimarySidebar";
import { WorkbenchDockedInspector } from "./workbench/WorkbenchDockedInspector";

export interface WorkbenchShellProps {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly isDrawerOpen?: boolean;
	readonly onToggleDrawer?: () => void;
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
	readonly onOpenSearch?: (
		direction: SearchDirection,
		vimSearch?: boolean,
	) => void;
	readonly searchWidget?: ReactNode;
	readonly activePrimaryTab?: import("./ActivityRail").PrimarySidebarTab;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
	readonly projectFileTree?: readonly import("@stateful-mcp/macro-protocol").FileTreeItemDto[];
	readonly onOpenFile?: (path: string) => void;
	readonly onRefreshFileTree?: () => void;
	readonly onCreateFile?: (parent: string, name: string) => void;
	readonly onCreateFolder?: (parent: string, name: string) => void;
}

export function WorkbenchShell({
	snapshot,
	status = "loading",
	errorMessage,
	onCommand,
	isDrawerOpen,
	onToggleDrawer,
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
	projectFileTree = [],
	onOpenFile,
	onRefreshFileTree,
	onCreateFile,
	onCreateFolder,
}: WorkbenchShellProps) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	const [surfaceFocused, setSurfaceFocused] = useState(false);
	const [vimNotice] = useState<string>();
	const [pendingCloseDoc, setPendingCloseDoc] =
		useState<PendingCloseDocument | null>(null);

	const surfaceRef = useRef<HTMLElement | null>(null);
	const shellRef = useRef<HTMLDivElement | null>(null);
	const surfaceAdapterRef = useRef<{
		element: HTMLElement;
		adapter: ReturnType<typeof getEditorSurfaceAdapter>;
	} | null>(null);
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
		if (surfaceAdapterRef.current?.element === element)
			return surfaceAdapterRef.current.adapter;
		const currentSnapshot = snapshotRef.current;
		const currentDocument = currentSnapshot?.editor.activeDocument;
		const currentDocumentMeta = currentSnapshot?.editor.documents.find(
			(document) =>
				document.documentId === currentSnapshot?.editor.activeDocumentId,
		);
		const adapter = getEditorSurfaceAdapter(
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
		surfaceAdapterRef.current = { element, adapter };
		return adapter;
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

	useEffect(() => {
		const onToggle = () => toggleVim();
		window.addEventListener("workbench:toggleVim", onToggle);
		return () => window.removeEventListener("workbench:toggleVim", onToggle);
	}, [toggleVim]);

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

	const requestId = () => crypto.randomUUID();
	const emitEditorOperation = (operation: EditorOperation) => {
		void onEditorOperation(operation);
	};

	const handleCloseDocument = (documentId: string, textRevision?: number) => {
		const docMeta = snapshot?.editor.documents.find(
			(d) => d.documentId === documentId,
		);
		const isTargetActive = activeDocumentMeta?.documentId === documentId;
		const isDirty =
			Boolean(docMeta?.dirty) || (isTargetActive && localDraft !== undefined);
		if (isDirty && docMeta) {
			setPendingCloseDoc({
				documentId,
				title: docMeta.title,
				textRevision: textRevision ?? docMeta.textRevision,
				filePath: docMeta.filePath,
			});
			return;
		}
		emitEditorOperation({
			operation: "editor.closeDocument",
			requestId: requestId(),
			documentId,
			expectedTextRevision: textRevision,
			force: false,
		});
	};

	const handleSaveAndClose = async (target: PendingCloseDocument) => {
		setPendingCloseDoc(null);
		if (
			localDraft !== undefined &&
			activeDocumentMeta?.documentId === target.documentId
		) {
			await flushDraft();
		}
		if (target.filePath) {
			await onEditorOperation({
				operation: "editor.save",
				requestId: requestId(),
				documentId: target.documentId,
			});
		} else {
			await onEditorOperation({
				operation: "editor.saveScratchpad",
				requestId: requestId(),
				documentId: target.documentId,
			});
		}
		await onEditorOperation({
			operation: "editor.closeDocument",
			requestId: requestId(),
			documentId: target.documentId,
			force: true,
		});
	};

	const handleDiscardAndClose = (target: PendingCloseDocument) => {
		emitEditorOperation({
			operation: "editor.closeDocument",
			requestId: requestId(),
			documentId: target.documentId,
			expectedTextRevision: target.textRevision,
			force: true,
		});
		setPendingCloseDoc(null);
	};

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
		<div
			className={`workbench-shell dock-${inspectorPosition}`}
			ref={shellRef}
			style={shellStyle}
		>
			<CloseDirtyDialog
				target={pendingCloseDoc}
				onSaveAndClose={handleSaveAndClose}
				onDiscardAndClose={handleDiscardAndClose}
				onCancel={() => setPendingCloseDoc(null)}
			/>

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
						onCloseDocument={handleCloseDocument}
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
							getSurfaceAdapter()?.jumpToMatch?.(lineNumber - 1, col ?? 0, 0);
						}}
						onReplace={(query, replacement, lineNumber, startOffset) => {
							const lineIdx =
								lineNumber !== undefined ? lineNumber - 1 : undefined;
							getSurfaceAdapter()?.replaceCurrentMatch?.(
								query,
								replacement,
								lineIdx,
								startOffset,
							);
						}}
						onReplaceAll={(query, replacement) => {
							getSurfaceAdapter()?.replaceAllMatches?.(query, replacement);
						}}
						onOpenFolderModal={onOpenFolderModal}
						onCommand={onCommand}
						projectFileTree={projectFileTree}
						onOpenFile={onOpenFile}
						onRefreshFileTree={onRefreshFileTree}
						onCreateFile={onCreateFile}
						onCreateFolder={onCreateFolder}
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
				{vimNotice && (
					<div className="editor-vim-notice" role="status">
						{vimNotice}
					</div>
				)}

				<div
					className={`editor-split-container editor-split-container--${activeGroup?.orientation ?? "vertical"}`}
				>
					{(snapshot.editor.groups.length > 0
						? snapshot.editor.groups
						: [
								activeGroup ?? {
									groupId: "default",
									documentIds: [],
									activeDocumentId: null,
									orientation: "vertical" as const,
								},
							]
					).map((group, groupIdx, allGroups) => {
						const groupDocs = snapshot.editor.documents.filter((d) =>
							group.documentIds.includes(d.documentId),
						);
						const isActiveGroup = group.groupId === activeGroup?.groupId;
						const groupActiveDocId =
							group.activeDocumentId ?? group.documentIds[0];
						const groupActiveDocMeta = groupActiveDocId
							? snapshot.editor.documents.find(
									(d) => d.documentId === groupActiveDocId,
								)
							: undefined;
						const groupActiveDoc = isActiveGroup
							? activeDocument
							: groupActiveDocId &&
									snapshot.editor.loadedDocuments?.[groupActiveDocId]
								? snapshot.editor.loadedDocuments[groupActiveDocId]
								: groupActiveDocMeta
									? {
											documentId: groupActiveDocMeta.documentId,
											textRevision: groupActiveDocMeta.textRevision,
											lines: [],
										}
									: null;

						return (
							<Fragment key={group.groupId}>
								{/* biome-ignore lint/a11y/useKeyWithClickEvents: split pane click is a mouse-only focus affordance; keyboard users navigate groups via editor group focus commands. Adding tabIndex/role would pollute tab order inside the editor layout. */}
								<div
									className={`editor-split-group-pane ${isActiveGroup ? "editor-split-group-pane--active" : ""}`}
									style={{ flex: group.sizeRatio ?? 1 }}
									onClick={() => {
										if (!isActiveGroup) {
											emitEditorOperation({
												operation: "editor.focusGroup",
												requestId: requestId(),
												groupId: group.groupId,
												expectedWorkspaceRevision: snapshot.revision,
											});
										}
									}}
								>
									<EditorGroupHeader
										documents={
											groupDocs.length > 0 ? groupDocs : activeGroupDocuments
										}
										activeDocumentId={
											group.activeDocumentId ?? snapshot.editor.activeDocumentId
										}
										activeDocument={groupActiveDoc}
										activeDocumentMeta={
											groupActiveDocMeta ?? activeDocumentMeta
										}
										canSplit={snapshot.editor.capabilities.canSplit}
										canCloseGroup={allGroups.length > 1}
										pendingEditor={isActiveGroup ? pendingEditor : false}
										hasConflict={
											isActiveGroup ? Boolean(editorConflict) : false
										}
										hasDraft={isActiveGroup ? localDraft !== undefined : false}
										pinnedMacros={snapshot.contributions?.pinnedMacros}
										onSelectDocument={(documentId) => {
											if (isActiveGroup && localDraft !== undefined) {
												flushDraft();
												return;
											}
											if (!group.documentIds.includes(documentId)) {
												emitEditorOperation({
													operation: "editor.openDocumentInGroup",
													requestId: requestId(),
													groupId: group.groupId,
													documentId,
													expectedWorkspaceRevision: snapshot.revision,
												});
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
										onCloseDocument={handleCloseDocument}
										onNewScratchpad={() =>
											emitEditorOperation({
												operation: "editor.newScratchpad",
												requestId: requestId(),
											})
										}
										onSplitGroup={() =>
											emitEditorOperation({
												operation: "editor.createSplitGroup",
												requestId: requestId(),
												sourceGroupId: group.groupId,
												documentId: groupActiveDoc?.documentId,
												moveDocument: groupDocs.length > 1,
												expectedWorkspaceRevision: snapshot.revision,
											})
										}
										onCloseGroup={() =>
											emitEditorOperation({
												operation: "editor.closeGroup",
												requestId: requestId(),
												groupId: group.groupId,
												expectedWorkspaceRevision: snapshot.revision,
											})
										}
										onExecuteValidLines={() => {
											if (!groupActiveDoc) return;
											emitEditorOperation({
												operation: "editor.executeValidLines",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
												expectedTextRevision: groupActiveDoc.textRevision,
											});
										}}
										onClearExecutedLines={() => {
											if (!groupActiveDoc) return;
											emitEditorOperation({
												operation: "editor.clearExecutedLines",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
												expectedTextRevision: groupActiveDoc.textRevision,
											});
										}}
										onResetExecutionState={() => {
											if (!groupActiveDoc) return;
											emitEditorOperation({
												operation: "editor.resetExecutionState",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
											});
										}}
										onInsertSnippet={handleInsertSnippet}
									/>

									<EditorCanvas
										activeDocument={groupActiveDoc}
										activeDocumentMeta={
											groupActiveDocMeta ?? activeDocumentMeta
										}
										localDraft={isActiveGroup ? localDraft : undefined}
										activeLines={isActiveGroup ? activeLines : []}
										editorConflict={isActiveGroup ? editorConflict : undefined}
										vimEnabled={isActiveGroup && vimState.enabled}
										vimMode={isActiveGroup ? vimState.mode : undefined}
										activeCellIndex={
											isActiveGroup && vimState.enabled
												? vimState.activeCellIndex
												: undefined
										}
										selectedCellRange={
											isActiveGroup && vimState.enabled
												? vimState.visualRange
												: null
										}
										searchWidget={isActiveGroup ? searchWidget : undefined}
										surfaceRef={isActiveGroup ? surfaceRef : { current: null }}
										onTextChange={(lines) =>
											groupActiveDocMeta &&
											onSetEditorDraft(groupActiveDocMeta.documentId, lines)
										}
										onFocusChange={(focused) => {
											if (isActiveGroup) {
												setSurfaceFocused(focused);
												if (focused && vimState.mode === "COMMAND")
													vimController.exitCommandMode();
												if (!focused) {
													clearDraftTimer();
													flushDraft();
												}
											}
										}}
										onCursorChange={(cursor) => {
											if (!isActiveGroup) return;
											onEditorCursorChange?.(cursor);
											if (vimState.enabled && vimState.mode !== "INSERT")
												return;
											const line = Number.parseInt(
												cursor.split(":")[0] ?? "",
												10,
											);
											const column = Number.parseInt(
												cursor.split(":")[1] ?? "",
												10,
											);
											if (Number.isFinite(line))
												vimController.setActiveCell(
													line - 1,
													Math.max(1, activeLines.length),
													Number.isFinite(column) ? column - 1 : undefined,
												);
										}}
										onKeyDown={(event) =>
											isActiveGroup ? vimController.handleKeyDown(event) : false
										}
										onPointerTarget={(lineIndex, column, dragging) => {
											if (isActiveGroup) {
												vimController.setPointerTarget(
													lineIndex,
													Math.max(1, activeLines.length),
													column,
													dragging,
												);
											}
										}}
										onExecuteLine={(lineNumber) =>
											groupActiveDoc &&
											emitEditorOperation({
												operation: "editor.executeLine",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
												lineNumber,
												expectedTextRevision: groupActiveDoc.textRevision,
											})
										}
										onExecuteRange={(startLine, endLine) =>
											groupActiveDoc &&
											emitEditorOperation({
												operation: "editor.executeRange",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
												startLine,
												endLine,
												expectedTextRevision: groupActiveDoc.textRevision,
											})
										}
										onPinMacro={(macroId) =>
											groupActiveDoc &&
											macroId !== null &&
											emitEditorOperation({
												operation: "editor.pinMacro",
												requestId: requestId(),
												documentId: groupActiveDoc.documentId,
												macroId,
											})
										}
										onReloadEditorConflict={onReloadEditorConflict}
										onOverwriteEditorConflict={onOverwriteEditorConflict}
									/>
								</div>
								{groupIdx < allGroups.length - 1 && (
									<div
										className={`editor-splitter editor-splitter--${group.orientation ?? "vertical"}`}
									/>
								)}
							</Fragment>
						);
					})}
				</div>

				<EditorOutputDrawer
					output={snapshot.editor.output}
					result={editorResult}
					isOpen={isDrawerOpen}
					onToggleOpen={onToggleDrawer}
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
