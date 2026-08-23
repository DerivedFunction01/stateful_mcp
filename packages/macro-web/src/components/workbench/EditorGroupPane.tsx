import type {
	EditorOperation,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useEditorSurfaceRegistration } from "../../hooks/useEditorSurfaceRegistration";
import { useGroupVimState } from "../../hooks/useWorkbenchVim";
import type {
	BrowserEditorSurfaceAdapter,
	BrowserVimGroupManager,
} from "../../lib/browser-vim";
import { getEditorSurfaceAdapter } from "../EditorSurfaceView";
import { EditorCanvas } from "./EditorCanvas";
import { EditorGroupHeader } from "./EditorGroupHeader";

export interface EditorGroupPaneProps {
	readonly group: NonNullable<WorkspaceSnapshot["editor"]["groups"][number]>;
	readonly allGroups: readonly NonNullable<
		WorkspaceSnapshot["editor"]["groups"][number]
	>[];
	readonly snapshot: WorkspaceSnapshot;
	readonly isActiveGroup: boolean;
	readonly pendingEditor: boolean;
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localLines: readonly string[];
		readonly result: import("@stateful-mcp/macro-protocol").EditorOperationResult;
	};
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

export function EditorGroupPane({
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
			style={{
				flex: 1,
				width: "100%",
				height: "100%",
				minWidth: 0,
				minHeight: 0,
			}}
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
