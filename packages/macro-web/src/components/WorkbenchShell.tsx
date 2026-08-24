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
import { useWorkbenchLayout } from "../hooks/useWorkbenchLayout";
import { useWorkbenchVim } from "../hooks/useWorkbenchVim";
import type { BrowserEditorSurfaceAdapter } from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import { loadUserPreferences } from "../lib/user-preferences-storage";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import { Splitter } from "./Splitter";
import {
	CloseDirtyDialog,
	type PendingCloseDocument,
} from "./workbench/CloseDirtyDialog";
import { EditorGroupPane } from "./workbench/EditorGroupPane";
import {
	flattenEditorLayout,
	renderEditorLayout,
} from "./workbench/EditorSplitLayout";
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
	readonly onEditTemplate?: (
		template: import("@stateful-mcp/macro-protocol").ScratchpadTemplateDescriptor,
	) => void;
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
	onEditTemplate,
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

	const activeTemplateDescriptor = activeDocumentMeta?.templateId
		? (snapshot.editor.templates.find(
				(t) => t.templateId === activeDocumentMeta.templateId,
			) ?? null)
		: null;

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
			onSetCellDefault={(lineNumber, macroId) =>
				activeDocument &&
				emitEditorOperation({
					operation: "editor.setCellDefault",
					requestId: requestId(),
					documentId: activeDocument.documentId,
					lineNumber,
					defaultMacroId: macroId,
					expectedTextRevision: activeDocument.textRevision,
				})
			}
			onJumpToLine={(lineNumber) => {
				vimController.setActiveCell(
					lineNumber - 1,
					Math.max(1, activeLines.length),
				);
			}}
			onInsertSnippet={handleInsertSnippet}
			onOpenTemplatePicker={() =>
				onCommand("workbench.action.newScratchpadFromTemplate")
			}
			activeTemplateDescriptor={activeTemplateDescriptor}
			onToggleTemplateLiteralArg={(slotKey, isLiteral) => {
				if (!activeTemplateDescriptor) return;
				const current = activeTemplateDescriptor.templateLiteralArgs ?? [];
				const next = isLiteral
					? [...current.filter((k) => k !== slotKey), slotKey]
					: current.filter((k) => k !== slotKey);
				emitEditorOperation({
					operation: "editor.updateTemplateLiteralArgs",
					requestId: requestId(),
					templateId: activeTemplateDescriptor.templateId,
					scope:
						activeTemplateDescriptor.source === "user" ? "user" : "project",
					literalArgs: next,
				});
			}}
			onEditTemplateMetadata={() => {
				if (activeTemplateDescriptor) {
					onEditTemplate?.(activeTemplateDescriptor);
				}
			}}
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
						onOpenResource={(resourceKind, resourceId) => {
							emitEditorOperation({
								operation: "editor.openResource",
								requestId: requestId(),
								resourceKind,
								resourceId,
								groupId: activeGroup?.groupId,
							});
						}}
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
						resourceTree={snapshot.project?.resourceTree}
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
								onNewFromTemplate={() =>
									onCommand("workbench.action.newScratchpadFromTemplate")
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
