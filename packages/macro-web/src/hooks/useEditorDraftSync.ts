import type {
	EditorDocumentDto,
	EditorOperation,
	ScratchpadLineDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { useCallback, useEffect, useRef } from "react";

function linesEqual(
	left: readonly string[] | undefined,
	right: readonly string[],
): boolean {
	return (
		left !== undefined &&
		left.length === right.length &&
		left.every((line, index) => line === right[index])
	);
}

export interface UseEditorDraftSyncOptions {
	readonly activeDocument?: ScratchpadSnapshotDto | null;
	readonly activeDocumentMeta?: EditorDocumentDto;
	readonly editorDrafts: Readonly<Record<string, readonly string[]>>;
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
	readonly onSetEditorDraft: (
		documentId: string,
		lines: readonly string[],
	) => void;
	readonly activeCellIndex?: number;
}

export function useEditorDraftSync({
	activeDocument,
	activeDocumentMeta,
	editorDrafts,
	onEditorOperation,
	onSetEditorDraft,
	activeCellIndex,
}: UseEditorDraftSyncOptions) {
	const localDraft = activeDocumentMeta
		? editorDrafts[activeDocumentMeta.documentId]
		: undefined;
	const activeLines =
		localDraft ?? activeDocument?.lines.map((line: ScratchpadLineDto) => line.rawText) ?? [];

	const draftTimerRef = useRef<number | undefined>(undefined);
	const lastSubmittedDraftRef = useRef<{
		documentId: string;
		lines: readonly string[];
		textRevision: number;
	} | null>(null);

	const onEditorOperationRef = useRef(onEditorOperation);
	onEditorOperationRef.current = onEditorOperation;

	const flushDraft = useCallback(() => {
		if (!activeDocumentMeta || localDraft === undefined) return;
		const previous = lastSubmittedDraftRef.current;
		if (
			previous &&
			previous.documentId === activeDocumentMeta.documentId &&
			linesEqual(previous.lines, localDraft) &&
			previous.textRevision === activeDocumentMeta.textRevision
		)
			return;
		lastSubmittedDraftRef.current = {
			documentId: activeDocumentMeta.documentId,
			lines: localDraft,
			textRevision: activeDocumentMeta.textRevision,
		};
		void onEditorOperationRef.current({
			operation: "editor.replaceText",
			requestId: crypto.randomUUID(),
			documentId: activeDocumentMeta.documentId,
			lines: localDraft,
			expectedTextRevision: activeDocumentMeta.textRevision,
		});
	}, [activeDocumentMeta, localDraft]);

	useEffect(() => {
		if (localDraft === undefined) {
			lastSubmittedDraftRef.current = null;
			return;
		}
		if (draftTimerRef.current !== undefined)
			window.clearTimeout(draftTimerRef.current);
		draftTimerRef.current = window.setTimeout(flushDraft, 250);
		return () => {
			if (draftTimerRef.current !== undefined)
				window.clearTimeout(draftTimerRef.current);
		};
	}, [
		activeDocumentMeta?.documentId,
		activeDocumentMeta?.textRevision,
		localDraft,
		flushDraft,
	]);

	const handleInsertSnippet = useCallback(
		(snippet: string) => {
			if (!activeDocumentMeta) return;
			const currentLines = localDraft ??
				activeDocument?.lines.map((l: ScratchpadLineDto) => l.rawText) ?? [""];
			const targetIdx = activeCellIndex ?? currentLines.length - 1;
			const newLines = [...currentLines];
			if (newLines[targetIdx] === "" || newLines[targetIdx] === undefined) {
				newLines[targetIdx] = snippet;
			} else {
				newLines.splice(targetIdx + 1, 0, snippet);
			}
			onSetEditorDraft(activeDocumentMeta.documentId, newLines);
		},
		[activeDocumentMeta, localDraft, activeDocument, activeCellIndex, onSetEditorDraft],
	);

	const clearDraftTimer = useCallback(() => {
		if (draftTimerRef.current !== undefined) {
			window.clearTimeout(draftTimerRef.current);
		}
	}, []);

	return {
		localDraft,
		activeLines,
		flushDraft,
		clearDraftTimer,
		handleInsertSnippet,
	};
}
