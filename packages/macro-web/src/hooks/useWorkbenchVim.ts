import type {
	EditorOperation,
	SearchDirection,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { type RefObject, useRef, useState, useSyncExternalStore } from "react";
import {
	type BrowserEditorSurfaceAdapter,
	type BrowserVimController,
	type BrowserVimState,
	createBrowserVimController,
} from "../lib/browser-vim";
import {
	loadUserPreferences,
	saveUserPreferences,
} from "../lib/user-preferences-storage";

export interface UseWorkbenchVimOptions {
	readonly snapshotRef: RefObject<WorkspaceSnapshot | undefined>;
	readonly getSurfaceAdapter: () => BrowserEditorSurfaceAdapter | undefined;
	readonly onOpenPalette?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (direction: SearchDirection, vimSearch?: boolean) => void;
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
}

export function useWorkbenchVim({
	snapshotRef,
	getSurfaceAdapter,
	onOpenPalette,
	onOpenSearch,
	onEditorOperation,
}: UseWorkbenchVimOptions) {
	const onOpenSearchRef = useRef(onOpenSearch);
	onOpenSearchRef.current = onOpenSearch;
	const onOpenPaletteRef = useRef(onOpenPalette);
	onOpenPaletteRef.current = onOpenPalette;
	const onEditorOperationRef = useRef(onEditorOperation);
	onEditorOperationRef.current = onEditorOperation;

	const [vimController] = useState<BrowserVimController>(() =>
		createBrowserVimController(loadUserPreferences().vimEnabled, {
			variant: () => {
				const activeDocId = snapshotRef.current?.editor.activeDocumentId;
				const activeDocMeta = snapshotRef.current?.editor.documents.find(
					(doc) => doc.documentId === activeDocId,
				);
				return activeDocMeta?.providerId === "file" ? "generic" : "scratchpad";
			},
			getAdapter: getSurfaceAdapter,
			getKeymap: () => snapshotRef.current?.keymap,
			onOpenCommandMode: (initialQuery, commandMode, commandToken) =>
				onOpenPaletteRef.current?.(
					initialQuery ?? "",
					commandMode,
					commandToken ?? "",
				),
			onOpenSearch: (direction, vimSearch) =>
				onOpenSearchRef.current?.(direction, vimSearch),
			onExecuteLine: (lineNum) => {
				const activeDocMeta = snapshotRef.current?.editor.documents.find(
					(doc) =>
						doc.documentId === snapshotRef.current?.editor.activeDocumentId,
				);
				if (activeDocMeta?.providerId === "file") return;
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				const targetLine =
					lineNum ?? (getSurfaceAdapter()?.getActiveCellIndex?.() ?? 0) + 1;
				void onEditorOperationRef.current({
					operation: "editor.executeLine",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					lineNumber: targetLine,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
			onExecuteRange: (startLine, endLine) => {
				const activeDocMeta = snapshotRef.current?.editor.documents.find(
					(doc) =>
						doc.documentId === snapshotRef.current?.editor.activeDocumentId,
				);
				if (activeDocMeta?.providerId === "file") return;
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				void onEditorOperationRef.current({
					operation: "editor.executeRange",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					startLine,
					endLine,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
			onExecuteValidLines: () => {
				const activeDocMeta = snapshotRef.current?.editor.documents.find(
					(doc) =>
						doc.documentId === snapshotRef.current?.editor.activeDocumentId,
				);
				if (activeDocMeta?.providerId === "file") return;
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				void onEditorOperationRef.current({
					operation: "editor.executeValidLines",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
		}),
	);

	const vimState = useSyncExternalStore<BrowserVimState>(
		vimController.subscribe,
		vimController.getState,
		vimController.getState,
	);

	const toggleVim = () => {
		const next = !vimState.enabled;
		vimController.setEnabled(next);
		saveUserPreferences({ vimEnabled: next });
	};

	return {
		vimController,
		vimState,
		toggleVim,
	};
}
