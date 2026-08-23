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
import { useGroupVimState, useWorkbenchVim } from "../hooks/useWorkbenchVim";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimGroupManager,
} from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import { loadUserPreferences } from "../lib/user-preferences-storage";
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
	readonly onOpenFileInGroup?: (groupId: string) => void;
	readonly onCreateFileInGroup?: (groupId: string) => void;
}

interface EditorGroupPaneProps {
	readonly group: NonNullable<WorkspaceSnapshot["editor"]["groups"][number]>;
	readonly allGroups: readonly NonNullable<
		WorkspaceSnapshot["editor"]["groups"][number]
	>[];
	readonly snapshot: WorkspaceSnapshot;
	readonly isActiveGroup: boolean;
	readonly pendingEditor: boolean;
	readonly editorConflict?: WorkbenchShellProps["editorConflict"];
	readonly localDraft?: readonly string[];
	readonly activeLines: readonly string[];
	readonly vimManager: BrowserVimGroupManager;
	readonly searchWidget?: ReactNode;
	readonly registerAdapter: (
		groupId: string,
		getter: () => BrowserEditorSurfaceAdapter | undefined,
	) => void;
	readonly unregisterAdapter: (groupId: string) => void;
	readonly onSelectDocument: (groupId: string, documentId: string) => void;
	readonly onRenameDocument: (documentId: string, title: string) => void;
	readonly onCloseDocument: (
		groupId: string,
		documentId: string,
		textRevision?: number,
	) => void;
	readonly onNewScratchpad: (groupId: string) => void;
	readonly onSplitGroup: (
		groupId: string,
		orientation: "vertical" | "horizontal",
		documentId?: string,
	) => void;
	readonly onCloseGroup: (groupId: string) => void;
	readonly onFocusGroup: (groupId: string) => void;
	readonly onSetEditorDraft: (
		documentId: string,
		lines: readonly string[],
	) => void;
	readonly emitEditorOperation: (operation: EditorOperation) => void;
	readonly onReloadEditorConflict: () => void | Promise<void>;
	readonly onOverwriteEditorConflict: () => void;
	readonly onInsertSnippet: (snippet: string) => void;
	readonly onEditorCursorChange?: (cursor: string) => void;
	readonly onOpenFile?: (groupId: string) => void;
	readonly onCreateFile?: (groupId: string) => void;
}

function EditorGroupPane({
	group,
	allGroups,
	snapshot,
	isActiveGroup,
	pendingEditor,
	editorConflict,
	localDraft,
	activeLines,
	vimManager,
	searchWidget,
	registerAdapter,
	unregisterAdapter,
	onSelectDocument,
	onRenameDocument,
	onCloseDocument,
	onNewScratchpad,
	onSplitGroup,
	onCloseGroup,
	onFocusGroup,
	onSetEditorDraft,
	emitEditorOperation,
	onReloadEditorConflict,
	onOverwriteEditorConflict,
	onInsertSnippet,
	onEditorCursorChange,
	onOpenFile,
	onCreateFile,
}: EditorGroupPaneProps) {
	const [surfaceFocused, setSurfaceFocused] = useState(false);
	const surfaceRef = useRef<HTMLElement | null>(null);
	const surfaceAdapterRef = useRef<{
		element: HTMLElement;
		adapter: ReturnType<typeof getEditorSurfaceAdapter>;
	} | null>(null);

	const groupVimState = useGroupVimState(vimManager, group.groupId);
	const groupController = vimManager.getGroupController(group.groupId);

	const groupDocs = snapshot.editor.documents.filter((d) =>
		group.documentIds.includes(d.documentId),
	);
	const groupActiveDocId = group.activeDocumentId ?? group.documentIds[0];
	const groupActiveDocMeta = groupActiveDocId
		? snapshot.editor.documents.find((d) => d.documentId === groupActiveDocId)
		: undefined;
	const groupActiveDoc = isActiveGroup
		? snapshot.editor.activeDocument
		: groupActiveDocId && snapshot.editor.loadedDocuments?.[groupActiveDocId]
			? snapshot.editor.loadedDocuments[groupActiveDocId]
			: groupActiveDocMeta
				? {
						documentId: groupActiveDocMeta.documentId,
						textRevision: groupActiveDocMeta.textRevision,
						lines: [],
					}
				: null;

	useEffect(() => {
		groupController.activateDocument(groupActiveDocId ?? null);
	}, [groupController, groupActiveDocId]);

	const getGroupSurfaceAdapter = useCallback(() => {
		const element = surfaceRef.current;
		if (!element) return undefined;
		if (surfaceAdapterRef.current?.element === element)
			return surfaceAdapterRef.current.adapter;
		const adapter = getEditorSurfaceAdapter(
			element,
			(text) => {
				if (groupActiveDocMeta)
					onSetEditorDraft(groupActiveDocMeta.documentId, text);
			},
			{
				documentId: groupActiveDoc?.documentId,
				textRevision: groupActiveDoc?.textRevision,
			},
		);
		surfaceAdapterRef.current = { element, adapter };
		return adapter;
	}, [
		groupActiveDoc?.documentId,
		groupActiveDoc?.textRevision,
		groupActiveDocMeta,
		onSetEditorDraft,
	]);

	useEffect(() => {
		registerAdapter(group.groupId, getGroupSurfaceAdapter);
		return () => unregisterAdapter(group.groupId);
	}, [
		getGroupSurfaceAdapter,
		group.groupId,
		registerAdapter,
		unregisterAdapter,
	]);

	useEditorSurfaceRegistration({
		snapshot,
		groupId: group.groupId,
		documentId: groupActiveDocId ?? undefined,
		surfaceRef,
		surfaceFocused: isActiveGroup && surfaceFocused,
		vimState: groupVimState,
		vimController: groupController,
		getSurfaceAdapter: getGroupSurfaceAdapter,
	});

	const effectiveLines = isActiveGroup
		? activeLines
		: (groupActiveDoc?.lines?.map((l) =>
				typeof l === "string" ? l : l.rawText,
			) ?? []);

	return (
		<div
			className={`editor-split-group-pane ${isActiveGroup ? "editor-split-group-pane--active" : ""}`}
			style={{ flex: group.sizeRatio ?? 1, minWidth: 0, minHeight: 0 }}
			onPointerDownCapture={(event) => {
				if (
					event.target instanceof Element &&
					event.target.closest(".editor-group-actions")
				)
					return;
				if (!isActiveGroup) {
					onFocusGroup(group.groupId);
				}
			}}
			onClick={(event) => {
				if (
					event.target instanceof Element &&
					event.target.closest(".editor-group-actions")
				)
					return;
				if (!isActiveGroup) {
					onFocusGroup(group.groupId);
				}
			}}
		>
			<EditorGroupHeader
				documents={groupDocs}
				activeDocumentId={group.activeDocumentId}
				activeDocument={groupActiveDoc}
				activeDocumentMeta={groupActiveDocMeta}
				isActiveGroup={isActiveGroup}
				canSplit={snapshot.editor.capabilities.canSplit}
				canCloseGroup={allGroups.length > 1}
				pendingEditor={isActiveGroup ? pendingEditor : false}
				hasConflict={isActiveGroup ? Boolean(editorConflict) : false}
				hasDraft={isActiveGroup ? localDraft !== undefined : false}
				pinnedMacros={snapshot.contributions?.pinnedMacros}
				onSelectDocument={(documentId) =>
					onSelectDocument(group.groupId, documentId)
				}
				onRenameDocument={onRenameDocument}
				onCloseDocument={(documentId, textRevision) =>
					onCloseDocument(group.groupId, documentId, textRevision)
				}
				onNewScratchpad={() => onNewScratchpad(group.groupId)}
				onSplitGroup={(orientation) =>
					onSplitGroup(group.groupId, orientation, groupActiveDoc?.documentId)
				}
				onCloseGroup={() => onCloseGroup(group.groupId)}
				onExecuteValidLines={() => {
					if (!groupActiveDoc) return;
					emitEditorOperation({
						operation: "editor.executeValidLines",
						requestId: crypto.randomUUID(),
						documentId: groupActiveDoc.documentId,
						expectedTextRevision: groupActiveDoc.textRevision,
					});
				}}
				onClearExecutedLines={() => {
					if (!groupActiveDoc) return;
					emitEditorOperation({
						operation: "editor.clearExecutedLines",
						requestId: crypto.randomUUID(),
						documentId: groupActiveDoc.documentId,
						expectedTextRevision: groupActiveDoc.textRevision,
					});
				}}
				onResetExecutionState={() => {
					if (!groupActiveDoc) return;
					emitEditorOperation({
						operation: "editor.resetExecutionState",
						requestId: crypto.randomUUID(),
						documentId: groupActiveDoc.documentId,
					});
				}}
				onInsertSnippet={onInsertSnippet}
			/>

			<EditorCanvas
				activeDocument={groupActiveDoc}
				activeDocumentMeta={groupActiveDocMeta}
				localDraft={isActiveGroup ? localDraft : undefined}
				activeLines={effectiveLines}
				editorConflict={isActiveGroup ? editorConflict : undefined}
				vimEnabled={groupVimState.enabled}
				vimMode={groupVimState.mode}
				activeCellIndex={
					groupVimState.enabled ? groupVimState.activeCellIndex : undefined
				}
				selectedCellRange={
					groupVimState.enabled ? groupVimState.visualRange : null
				}
				searchWidget={isActiveGroup ? searchWidget : undefined}
				surfaceRef={surfaceRef}
				onTextChange={(lines) =>
					groupActiveDocMeta &&
					onSetEditorDraft(groupActiveDocMeta.documentId, lines)
				}
				onNewScratchpad={() => onNewScratchpad(group.groupId)}
				onOpenFile={() => onOpenFile?.(group.groupId)}
				onCreateFile={() => onCreateFile?.(group.groupId)}
				onFocusChange={(focused) => {
					setSurfaceFocused(focused);
					if (focused && !isActiveGroup) {
						onFocusGroup(group.groupId);
					}
					if (!focused) {
						groupController.resetView("blur");
					}
				}}
				onCursorChange={(cursor) => {
					if (isActiveGroup) onEditorCursorChange?.(cursor);
					if (groupVimState.enabled && groupVimState.mode !== "INSERT") return;
					const line = Number.parseInt(cursor.split(":")[0] ?? "", 10);
					const column = Number.parseInt(cursor.split(":")[1] ?? "", 10);
					if (Number.isFinite(line))
						groupController.setActiveCell(
							line - 1,
							Math.max(1, effectiveLines.length),
							Number.isFinite(column) ? column - 1 : undefined,
						);
				}}
				onKeyDown={(event) => groupController.handleKeyDown(event)}
				onPointerTarget={(lineIndex, column, dragging) => {
					groupController.setPointerTarget(
						lineIndex,
						Math.max(1, effectiveLines.length),
						column,
						dragging,
					);
				}}
				onExecuteLine={(lineNumber) =>
					groupActiveDoc &&
					emitEditorOperation({
						operation: "editor.executeLine",
						requestId: crypto.randomUUID(),
						documentId: groupActiveDoc.documentId,
						lineNumber,
						expectedTextRevision: groupActiveDoc.textRevision,
					})
				}
				onExecuteRange={(startLine, endLine) =>
					groupActiveDoc &&
					emitEditorOperation({
						operation: "editor.executeRange",
						requestId: crypto.randomUUID(),
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
						requestId: crypto.randomUUID(),
						documentId: groupActiveDoc.documentId,
						macroId,
					})
				}
				onReloadEditorConflict={onReloadEditorConflict}
				onOverwriteEditorConflict={onOverwriteEditorConflict}
			/>
		</div>
	);
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
	onOpenFileInGroup,
	onCreateFileInGroup,
}: WorkbenchShellProps) {
	const { t } = useI18n();
	const registry = useEditorSurfaceRegistry();
	const [vimNotice] = useState<string>();
	const [pendingCloseDoc, setPendingCloseDoc] =
		useState<PendingCloseDocument | null>(null);

	const shellRef = useRef<HTMLDivElement | null>(null);
	const groupAdaptersRef = useRef(
		new Map<string, () => BrowserEditorSurfaceAdapter | undefined>(),
	);
	const snapshotRef = useRef(snapshot);
	snapshotRef.current = snapshot;

	const registerAdapter = useCallback(
		(
			groupId: string,
			getter: () => BrowserEditorSurfaceAdapter | undefined,
		) => {
			groupAdaptersRef.current.set(groupId, getter);
		},
		[],
	);

	const unregisterAdapter = useCallback((groupId: string) => {
		groupAdaptersRef.current.delete(groupId);
	}, []);

	const activeDocument = snapshot?.editor.activeDocument;
	const activeDocumentMeta = snapshot?.editor.documents.find(
		(document) => document.documentId === snapshot?.editor.activeDocumentId,
	);

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

	const { vimManager, vimController, vimState, toggleVim } = useWorkbenchVim({
		snapshotRef,
		getSurfaceAdapter: (groupId) => {
			const groupKey =
				groupId ?? snapshotRef.current?.editor.activeGroupId ?? "default";
			return groupAdaptersRef.current.get(groupKey)?.();
		},
		onCommandModeExit: (targetGroupId) => {
			window.setTimeout(() => {
				const activeId =
					targetGroupId ??
					snapshotRef.current?.editor.activeGroupId ??
					"default";
				const target =
					registry.focusTarget(activeId) ?? registry.getActive()?.element;
				if (target?.isConnected) target.focus();
			}, 0);
		},
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

	const requestId = () => crypto.randomUUID();
	const emitEditorOperation = (operation: EditorOperation) => {
		void onEditorOperation(operation);
	};

	const handleCloseDocument = (
		groupId: string,
		documentId: string,
		textRevision?: number,
	) => {
		const docMeta = snapshot?.editor.documents.find(
			(d) => d.documentId === documentId,
		);
		const isTargetActive = activeDocumentMeta?.documentId === documentId;
		const isDirty =
			Boolean(docMeta?.dirty) || (isTargetActive && localDraft !== undefined);
		if (isDirty && docMeta) {
			setPendingCloseDoc({
				groupId,
				documentId,
				title: docMeta.title,
				textRevision: textRevision ?? docMeta.textRevision,
				filePath: docMeta.filePath,
			});
			return;
		}
		emitEditorOperation({
			operation: "editor.closeDocumentInGroup",
			requestId: requestId(),
			groupId,
			documentId,
			expectedTextRevision: textRevision,
			force: false,
		});
	};

	const handleCloseDocumentGlobal = (
		documentId: string,
		textRevision?: number,
	) => {
		const docMeta = snapshot?.editor.documents.find(
			(document) => document.documentId === documentId,
		);
		const isDirty = Boolean(docMeta?.dirty);
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
			operation: "editor.closeDocumentInGroup",
			requestId: requestId(),
			groupId: target.groupId ?? activeGroup?.groupId ?? "",
			documentId: target.documentId,
			force: true,
		});
	};

	const handleDiscardAndClose = (target: PendingCloseDocument) => {
		emitEditorOperation({
			operation: "editor.closeDocumentInGroup",
			requestId: requestId(),
			groupId: target.groupId ?? activeGroup?.groupId ?? "",
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

	const activeGroup =
		snapshot.editor.groups.find(
			(group) => group.groupId === snapshot.editor.activeGroupId,
		) ?? snapshot.editor.groups[0];
	const layoutRoot = snapshot.editor.editorLayout?.root;
	const orderedGroups = layoutRoot
		? flattenEditorLayout(layoutRoot)
				.map((groupId) =>
					snapshot.editor.groups.find((group) => group.groupId === groupId),
				)
				.filter((group): group is NonNullable<typeof group> => Boolean(group))
		: snapshot.editor.groups;
	const renderedGroups = new Map<string, ReactNode>();
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
						onCloseDocument={handleCloseDocumentGlobal}
						onNewScratchpad={() =>
							emitEditorOperation({
								operation: "editor.newScratchpad",
								requestId: requestId(),
								groupId: activeGroup?.groupId,
							})
						}
						activeDocumentLines={activeLines}
						onJumpToLine={(lineNumber, col) => {
							vimController.setActiveCell(
								lineNumber - 1,
								Math.max(1, activeLines.length),
							);
							const activeSurface = registry.getActive();
							activeSurface?.adapter?.jumpToMatch?.(
								lineNumber - 1,
								col ?? 0,
								0,
							);
						}}
						onReplace={(query, replacement, lineNumber, startOffset) => {
							const lineIdx =
								lineNumber !== undefined ? lineNumber - 1 : undefined;
							const activeSurface = registry.getActive();
							activeSurface?.adapter?.replaceCurrentMatch?.(
								query,
								replacement,
								lineIdx,
								startOffset,
							);
						}}
						onReplaceAll={(query, replacement) => {
							const activeSurface = registry.getActive();
							activeSurface?.adapter?.replaceAllMatches?.(query, replacement);
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

				<div className="editor-split-container editor-split-container--vertical">
					{(orderedGroups.length > 0
						? orderedGroups
						: [
								activeGroup ?? {
									groupId: "default",
									documentIds: [],
									activeDocumentId: null,
									orientation: "vertical" as const,
								},
							]
					).map((group, _groupIdx, allGroups) => {
						const isActiveGroup = group.groupId === activeGroup?.groupId;
						const groupElement = (
							<EditorGroupPane
								key={group.groupId}
								group={group}
								allGroups={allGroups}
								snapshot={snapshot}
								isActiveGroup={isActiveGroup}
								pendingEditor={isActiveGroup ? pendingEditor : false}
								editorConflict={isActiveGroup ? editorConflict : undefined}
								localDraft={isActiveGroup ? localDraft : undefined}
								activeLines={isActiveGroup ? activeLines : []}
								vimManager={vimManager}
								searchWidget={isActiveGroup ? searchWidget : undefined}
								registerAdapter={registerAdapter}
								unregisterAdapter={unregisterAdapter}
								onSelectDocument={(groupId, documentId) => {
									if (isActiveGroup && localDraft !== undefined) {
										flushDraft();
										return;
									}
									emitEditorOperation({
										operation: "editor.openDocumentInGroup",
										requestId: requestId(),
										groupId,
										documentId,
									});
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
								onNewScratchpad={(groupId) =>
									emitEditorOperation({
										operation: "editor.newScratchpad",
										requestId: requestId(),
										groupId:
											groupId && groupId !== "default"
												? groupId
												: activeGroup?.groupId,
									})
								}
								onSplitGroup={(groupId, orientation, docId) =>
									emitEditorOperation({
										operation: "editor.createSplitGroup",
										requestId: requestId(),
										sourceGroupId: groupId,
										orientation,
										documentId: docId,
										behavior: loadUserPreferences().splitEditorBehavior,
									})
								}
								onCloseGroup={(groupId) =>
									(() => {
										emitEditorOperation({
											operation: "editor.closeGroup",
											requestId: requestId(),
											groupId,
										});
									})()
								}
								onFocusGroup={(groupId) => {
									emitEditorOperation({
										operation: "editor.focusGroup",
										requestId: requestId(),
										groupId,
									});
								}}
								onSetEditorDraft={onSetEditorDraft}
								emitEditorOperation={emitEditorOperation}
								onReloadEditorConflict={onReloadEditorConflict}
								onOverwriteEditorConflict={onOverwriteEditorConflict}
								onInsertSnippet={handleInsertSnippet}
								onEditorCursorChange={onEditorCursorChange}
								onOpenFile={(groupId) =>
									onOpenFileInGroup?.(
										groupId && groupId !== "default"
											? groupId
											: (activeGroup?.groupId ?? groupId),
									)
								}
								onCreateFile={(groupId) =>
									onCreateFileInGroup?.(
										groupId && groupId !== "default"
											? groupId
											: (activeGroup?.groupId ?? groupId),
									)
								}
							/>
						);
						renderedGroups.set(group.groupId, groupElement);
						return null;
					})}
					{layoutRoot
						? renderEditorLayout(layoutRoot, renderedGroups, (nodeId, ratios) =>
								emitEditorOperation({
									operation: "editor.resizeSplit",
									requestId: requestId(),
									nodeId,
									ratios,
								}),
							)
						: orderedGroups.map((group, index) => (
								<Fragment key={group.groupId}>
									{renderedGroups.get(group.groupId)}
									{index < orderedGroups.length - 1 && (
										<div className="editor-splitter editor-splitter--vertical" />
									)}
								</Fragment>
							))}
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

function flattenEditorLayout(
	node: NonNullable<WorkspaceSnapshot["editor"]["editorLayout"]>["root"],
): string[] {
	return node.kind === "group"
		? [node.groupId]
		: node.children.flatMap((child) => flattenEditorLayout(child));
}

function EditorSplitDivider({
	orientation,
	nodeId,
	index,
	childrenCount,
	currentRatios,
	onResize,
}: {
	readonly orientation: "horizontal" | "vertical";
	readonly nodeId: string;
	readonly index: number;
	readonly childrenCount: number;
	readonly currentRatios: readonly number[];
	readonly onResize: (nodeId: string, ratios: readonly number[]) => void;
}) {
	const dividerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{
		startPos: number;
		containerSize: number;
		leftRatio: number;
		rightRatio: number;
	} | null>(null);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const parent = dividerRef.current?.parentElement;
		if (!parent) return;
		const rect = parent.getBoundingClientRect();
		const containerSize = orientation === "vertical" ? rect.width : rect.height;
		const leftRatio = currentRatios[index] ?? 1 / childrenCount;
		const rightRatio = currentRatios[index + 1] ?? 1 / childrenCount;
		dragRef.current = {
			startPos: orientation === "vertical" ? event.clientX : event.clientY,
			containerSize: Math.max(containerSize, 1),
			leftRatio,
			rightRatio,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const currentPos =
			orientation === "vertical" ? event.clientX : event.clientY;
		const deltaPx = currentPos - drag.startPos;
		const deltaRatio = deltaPx / drag.containerSize;
		const sumRatios = drag.leftRatio + drag.rightRatio;
		const minRatio = 0.1;
		const nextLeft = Math.max(
			minRatio,
			Math.min(sumRatios - minRatio, drag.leftRatio + deltaRatio),
		);
		const nextRight = sumRatios - nextLeft;

		const nextRatios = [...currentRatios];
		nextRatios[index] = nextLeft;
		nextRatios[index + 1] = nextRight;
		onResize(nodeId, nextRatios);
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const handleDoubleClick = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const equalRatio = 1 / childrenCount;
		const nextRatios = Array(childrenCount).fill(equalRatio);
		onResize(nodeId, nextRatios);
	};

	return (
		<div
			ref={dividerRef}
			className={`editor-splitter editor-splitter--${orientation}`}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onDoubleClick={handleDoubleClick}
		/>
	);
}

function renderEditorLayout(
	node: NonNullable<WorkspaceSnapshot["editor"]["editorLayout"]>["root"],
	groups: ReadonlyMap<string, ReactNode>,
	onResize: (nodeId: string, ratios: readonly number[]) => void,
): ReactNode {
	if (node.kind === "group") return groups.get(node.groupId) ?? null;
	const childrenCount = node.children.length;
	const ratios =
		node.sizeRatios && node.sizeRatios.length === childrenCount
			? node.sizeRatios
			: Array(childrenCount).fill(1 / childrenCount);

	return (
		<div
			className={`editor-split-container editor-split-container--${node.orientation}`}
			data-layout-node-id={node.nodeId}
			style={{
				display: "flex",
				flexDirection: node.orientation === "vertical" ? "row" : "column",
				flex: 1,
				width: "100%",
				height: "100%",
			}}
		>
			{node.children.map((child, index) => (
				<Fragment key={child.kind === "group" ? child.groupId : child.nodeId}>
					<div
						style={{
							flex: ratios[index] ?? 1,
							display: "flex",
							minWidth: 0,
							minHeight: 0,
							overflow: "hidden",
						}}
					>
						{renderEditorLayout(child, groups, onResize)}
					</div>
					{index < childrenCount - 1 && (
						<EditorSplitDivider
							orientation={node.orientation}
							nodeId={node.nodeId}
							index={index}
							childrenCount={childrenCount}
							currentRatios={ratios}
							onResize={onResize}
						/>
					)}
				</Fragment>
			))}
		</div>
	);
}
