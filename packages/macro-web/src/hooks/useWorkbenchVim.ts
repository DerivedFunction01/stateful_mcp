import type {
	EditorOperation,
	SearchDirection,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	type RefObject,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	type BrowserEditorSurfaceAdapter,
	type BrowserVimController,
	type BrowserVimGroupController,
	type BrowserVimGroupManager,
	type BrowserVimState,
	createBrowserVimGroupManager,
} from "../lib/browser-vim";
import {
	loadUserPreferences,
	saveUserPreferences,
} from "../lib/user-preferences-storage";

export interface UseWorkbenchVimOptions {
	readonly snapshotRef: RefObject<WorkspaceSnapshot | undefined>;
	readonly getSurfaceAdapter: (
		groupId?: string,
		documentId?: string | null,
	) => BrowserEditorSurfaceAdapter | undefined;
	readonly onCommandModeExit?: (groupId?: string) => void;
	readonly onOpenPalette?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
		groupId?: string,
	) => void;
	readonly onOpenSearch?: (
		direction: SearchDirection,
		vimSearch?: boolean,
		groupId?: string,
	) => void;
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
}

export function useGroupVimState(
	manager: BrowserVimGroupManager,
	groupId: string,
): BrowserVimState {
	return useSyncExternalStore<BrowserVimState>(
		(cb) => manager.subscribe(cb, groupId),
		() => manager.getState(groupId),
		() => manager.getState(groupId),
	);
}

export function useWorkbenchVim({
	snapshotRef,
	getSurfaceAdapter,
	onOpenPalette,
	onOpenSearch,
	onEditorOperation,
	onCommandModeExit,
}: UseWorkbenchVimOptions) {
	const onOpenSearchRef = useRef(onOpenSearch);
	onOpenSearchRef.current = onOpenSearch;
	const onOpenPaletteRef = useRef(onOpenPalette);
	onOpenPaletteRef.current = onOpenPalette;
	const onEditorOperationRef = useRef(onEditorOperation);
	onEditorOperationRef.current = onEditorOperation;
	const onCommandModeExitRef = useRef(onCommandModeExit);
	onCommandModeExitRef.current = onCommandModeExit;

	const [vimManager] = useState<BrowserVimGroupManager>(() =>
		createBrowserVimGroupManager(loadUserPreferences().vimEnabled, {
			getVariant: (groupId, docId) => {
				const currentDocId =
					docId ??
					snapshotRef.current?.editor.groups.find((g) => g.groupId === groupId)
						?.activeDocumentId ??
					snapshotRef.current?.editor.activeDocumentId;
				const docMeta = snapshotRef.current?.editor.documents.find(
					(doc) => doc.documentId === currentDocId,
				);
				return docMeta?.providerId === "file" ? "generic" : "scratchpad";
			},
			getAdapter: (groupId, docId) => getSurfaceAdapter(groupId, docId),
			getKeymap: () => snapshotRef.current?.keymap,
			onOpenCommandMode: (groupId, initialQuery, commandMode, commandToken) =>
				onOpenPaletteRef.current?.(
					initialQuery ?? "",
					commandMode,
					commandToken ?? "",
					groupId,
				),
			onOpenSearch: (groupId, direction, vimSearch) =>
				onOpenSearchRef.current?.(direction, vimSearch, groupId),
			onExecuteLine: (groupId, docId, lineNum) => {
				const currentDocId =
					docId ??
					snapshotRef.current?.editor.groups.find((g) => g.groupId === groupId)
						?.activeDocumentId ??
					snapshotRef.current?.editor.activeDocumentId;
				const docMeta = snapshotRef.current?.editor.documents.find(
					(doc) => doc.documentId === currentDocId,
				);
				if (docMeta?.providerId === "file") return;
				const doc =
					(currentDocId &&
						snapshotRef.current?.editor.loadedDocuments?.[currentDocId]) ??
					(currentDocId === snapshotRef.current?.editor.activeDocumentId
						? snapshotRef.current?.editor.activeDocument
						: undefined);
				if (!doc) return;
				const targetLine =
					lineNum ??
					(getSurfaceAdapter(groupId, currentDocId)?.getActiveCellIndex?.() ??
						0) + 1;
				void onEditorOperationRef.current({
					operation: "editor.executeLine",
					requestId: crypto.randomUUID(),
					documentId: doc.documentId,
					lineNumber: targetLine,
					expectedTextRevision: doc.textRevision,
				});
			},
			onExecuteRange: (groupId, docId, startLine, endLine) => {
				const currentDocId =
					docId ??
					snapshotRef.current?.editor.groups.find((g) => g.groupId === groupId)
						?.activeDocumentId ??
					snapshotRef.current?.editor.activeDocumentId;
				const docMeta = snapshotRef.current?.editor.documents.find(
					(doc) => doc.documentId === currentDocId,
				);
				if (docMeta?.providerId === "file") return;
				const doc =
					(currentDocId &&
						snapshotRef.current?.editor.loadedDocuments?.[currentDocId]) ??
					(currentDocId === snapshotRef.current?.editor.activeDocumentId
						? snapshotRef.current?.editor.activeDocument
						: undefined);
				if (!doc) return;
				void onEditorOperationRef.current({
					operation: "editor.executeRange",
					requestId: crypto.randomUUID(),
					documentId: doc.documentId,
					startLine,
					endLine,
					expectedTextRevision: doc.textRevision,
				});
			},
			onExecuteValidLines: (groupId, docId) => {
				const currentDocId =
					docId ??
					snapshotRef.current?.editor.groups.find((g) => g.groupId === groupId)
						?.activeDocumentId ??
					snapshotRef.current?.editor.activeDocumentId;
				const docMeta = snapshotRef.current?.editor.documents.find(
					(doc) => doc.documentId === currentDocId,
				);
				if (docMeta?.providerId === "file") return;
				const doc =
					(currentDocId &&
						snapshotRef.current?.editor.loadedDocuments?.[currentDocId]) ??
					(currentDocId === snapshotRef.current?.editor.activeDocumentId
						? snapshotRef.current?.editor.activeDocument
						: undefined);
				if (!doc) return;
				void onEditorOperationRef.current({
					operation: "editor.executeValidLines",
					requestId: crypto.randomUUID(),
					documentId: doc.documentId,
					expectedTextRevision: doc.textRevision,
				});
			},
		}),
	);

	useEffect(() => {
		const exitCommandMode = (event?: Event) => {
			const customEvent = event as
				| CustomEvent<{ groupId?: string }>
				| undefined;
			const targetGroupId = customEvent?.detail?.groupId;
			vimManager.exitCommandMode(targetGroupId);
			onCommandModeExitRef.current?.(targetGroupId);
		};
		window.addEventListener("workbench:exitVimCommandMode", exitCommandMode);
		return () =>
			window.removeEventListener(
				"workbench:exitVimCommandMode",
				exitCommandMode,
			);
	}, [vimManager]);

	const activeGroupId = snapshotRef.current?.editor.activeGroupId ?? "default";
	const vimController: BrowserVimController =
		vimManager.getGroupController(activeGroupId);

	const vimState = useSyncExternalStore<BrowserVimState>(
		(cb) => vimManager.subscribe(cb, activeGroupId),
		() => vimManager.getState(activeGroupId),
		() => vimManager.getState(activeGroupId),
	);

	const toggleVim = () => {
		const next = !vimState.enabled;
		vimManager.setEnabled(next);
		saveUserPreferences({ vimEnabled: next });
	};

	return {
		vimManager,
		vimController,
		vimState,
		toggleVim,
		getGroupController: (groupId: string): BrowserVimGroupController =>
			vimManager.getGroupController(groupId),
		getGroupState: (groupId: string): BrowserVimState =>
			vimManager.getState(groupId),
	};
}
