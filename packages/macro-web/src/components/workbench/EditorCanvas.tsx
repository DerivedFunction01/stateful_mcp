import type {
	EditorDocumentDto,
	EditorMode,
	EditorOperationResult,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import type { ReactNode, RefObject } from "react";
import type { BrowserVimKeyboardEvent, CellRange } from "../../lib/browser-vim";
import { useI18n } from "../../lib/macro-i18n-provider";
import { EditorSurfaceView } from "../EditorSurfaceView";
import { EditorConflictBanner } from "./EditorConflictBanner";

export interface EditorCanvasProps {
	readonly activeDocument?: ScratchpadSnapshotDto | null;
	readonly activeDocumentMeta?: EditorDocumentDto;
	readonly localDraft?: readonly string[];
	readonly activeLines: readonly string[];
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localLines: readonly string[];
		readonly result: EditorOperationResult;
	};
	readonly vimEnabled: boolean;
	readonly vimMode?: EditorMode;
	readonly activeCellIndex?: number;
	readonly selectedCellRange?: CellRange | null;
	readonly searchWidget?: ReactNode;
	readonly surfaceRef: RefObject<HTMLElement | null>;
	readonly onTextChange: (lines: readonly string[]) => void;
	readonly onFocusChange: (focused: boolean) => void;
	readonly onCursorChange: (cursor: string) => void;
	readonly onKeyDown: (event: BrowserVimKeyboardEvent) => boolean;
	readonly onPointerTarget: (
		lineIndex: number,
		column: number,
		dragging: boolean,
	) => void;
	readonly onExecuteLine: (lineNumber: number) => void;
	readonly onExecuteRange: (startLine: number, endLine: number) => void;
	readonly onPinMacro: (macroId: string | null) => void;
	readonly onReloadEditorConflict: () => void | Promise<void>;
	readonly onOverwriteEditorConflict: () => void;
}

export function EditorCanvas({
	activeDocument,
	activeDocumentMeta,
	localDraft,
	activeLines: _activeLines,
	editorConflict,
	vimEnabled,
	vimMode,
	activeCellIndex,
	selectedCellRange,
	searchWidget,
	surfaceRef,
	onTextChange,
	onFocusChange,
	onCursorChange,
	onKeyDown,
	onPointerTarget,
	onExecuteLine,
	onExecuteRange,
	onPinMacro,
	onReloadEditorConflict,
	onOverwriteEditorConflict,
}: EditorCanvasProps) {
	const { t } = useI18n();

	return (
		<div className="editor-main-canvas">
			{activeDocument && activeDocumentMeta ? (
				<EditorSurfaceView
					key={activeDocumentMeta.documentId}
					documentId={activeDocumentMeta.documentId}
					lines={activeDocument.lines}
					draft={localDraft}
					pinnedMacroIds={activeDocumentMeta.pinnedMacroIds}
					disabled={Boolean(editorConflict)}
					activeCellIndex={activeCellIndex}
					selectedCellRange={selectedCellRange}
					vimEnabled={vimEnabled}
					vimMode={vimMode}
					searchWidget={searchWidget}
					onTextChange={onTextChange}
					onFocusChange={onFocusChange}
					onCursorChange={onCursorChange}
					onKeyDown={onKeyDown}
					onPointerTarget={onPointerTarget}
					surfaceRef={surfaceRef}
					onExecuteLine={onExecuteLine}
					onExecuteRange={onExecuteRange}
					onPinMacro={onPinMacro}
				/>
			) : (
				<section className="editor-unavailable" role="status">
					<strong>{t("editor.inactive.title")}</strong>
					<span>{t("editor.inactive.description")}</span>
				</section>
			)}

			{editorConflict && (
				<EditorConflictBanner
					onReload={onReloadEditorConflict}
					onOverwrite={onOverwriteEditorConflict}
				/>
			)}
		</div>
	);
}
