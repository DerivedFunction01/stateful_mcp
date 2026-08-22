import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { Columns2, Eraser, Pin, Play, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface EditorGroupHeaderProps {
	readonly documents: readonly EditorDocumentDto[];
	readonly activeDocumentId?: string | null;
	readonly activeDocument?: ScratchpadSnapshotDto | null;
	readonly activeDocumentMeta?: EditorDocumentDto;
	readonly canSplit?: boolean;
	readonly pendingEditor: boolean;
	readonly hasConflict: boolean;
	readonly hasDraft: boolean;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly onSelectDocument: (documentId: string) => void;
	readonly onRenameDocument: (documentId: string, title: string) => void;
	readonly onCloseDocument: (documentId: string, textRevision: number) => void;
	readonly onNewScratchpad: () => void;
	readonly onSplitGroup: () => void;
	readonly onExecuteValidLines: () => void;
	readonly onClearExecutedLines: () => void;
	readonly onResetExecutionState: () => void;
	readonly onInsertSnippet: (snippet: string) => void;
}

export function EditorGroupHeader({
	documents,
	activeDocumentId,
	activeDocument,
	activeDocumentMeta,
	canSplit = true,
	pendingEditor,
	hasConflict,
	hasDraft,
	pinnedMacros,
	onSelectDocument,
	onRenameDocument,
	onCloseDocument,
	onNewScratchpad,
	onSplitGroup,
	onExecuteValidLines,
	onClearExecutedLines,
	onResetExecutionState,
	onInsertSnippet,
}: EditorGroupHeaderProps) {
	const { t } = useI18n();

	const tabsRef = useRef<HTMLDivElement | null>(null);

	const isScratchpad = Boolean(
		activeDocument &&
		(activeDocumentMeta?.providerId === "scratchpad" ||
			activeDocumentMeta?.providerId === "macro.text" ||
			!activeDocumentMeta?.filePath),
	);

	const isActionDisabled = Boolean(hasConflict || hasDraft || pendingEditor);

	useEffect(() => {
		if (!activeDocumentId) return;
		const container = tabsRef.current;
		if (!container) return;
		const el = container.querySelector<HTMLElement>(
			`[data-document-id="${CSS.escape(activeDocumentId)}"]`,
		);
		if (el) {
			el.scrollIntoView({
				behavior: "smooth",
				inline: "nearest",
				block: "nearest",
			});
		}
	}, [activeDocumentId]);

	return (
		<div className="editor-group-header">
			<div
				className="workbench-tabs"
				role="tablist"
				aria-label={t("workbench.tabs")}
				ref={tabsRef}
				onWheel={(event) => {
					if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
					if (event.deltaY === 0) return;
					event.preventDefault();
					const target = event.currentTarget;
					target.scrollLeft += event.deltaY;
				}}
			>
				{documents.map((document) => (
					<div
						className={`workbench-document-tab ${document.documentId === activeDocumentId ? "active" : ""}`}
						key={document.documentId}
						data-document-id={document.documentId}
					>
						<button
							className="tab-title-btn"
							type="button"
							title={document.title}
							onClick={() => onSelectDocument(document.documentId)}
							onDoubleClick={() => {
								const title = window.prompt(
									t("editor.document.rename"),
									document.title,
								);
								if (title) onRenameDocument(document.documentId, title);
							}}
							role="tab"
							aria-selected={document.documentId === activeDocumentId}
						>
							<span>{document.title}</span>
							{document.dirty && <span className="tab-dirty-indicator">*</span>}
						</button>
						<button
							className="workbench-tab-close"
							type="button"
							aria-label={t("editor.document.close")}
							disabled={documents.length <= 1}
							onClick={() =>
								onCloseDocument(document.documentId, document.textRevision)
							}
						>
							<X size={12} />
						</button>
					</div>
				))}

				<button
					className="tab-new-btn"
					type="button"
					title={t("editor.document.new")}
					onClick={onNewScratchpad}
				>
					<Plus size={14} />
				</button>
			</div>

			<div className="editor-group-actions">
				<button
					type="button"
					className="editor-split-btn"
					title={t("editor.group.split")}
					disabled={!canSplit || pendingEditor}
					onClick={onSplitGroup}
				>
					<Columns2 size={14} />
				</button>

				{isScratchpad && (
					<>
						<button
							type="button"
							className="editor-preview-btn"
							title={t("editor.execution.validLines")}
							disabled={isActionDisabled}
							onClick={onExecuteValidLines}
						>
							<Play size={13} />
						</button>
						<button
							type="button"
							className="editor-split-btn"
							title={t("editor.clearExecuted")}
							disabled={isActionDisabled}
							onClick={onClearExecutedLines}
						>
							<Eraser size={14} />
						</button>
						<button
							type="button"
							className="editor-split-btn"
							title={t("editor.resetExecution")}
							disabled={isActionDisabled}
							onClick={onResetExecutionState}
						>
							<RotateCcw size={14} />
						</button>
						{pinnedMacros && pinnedMacros.length > 0 && (
							<div className="editor-quickrun-bar">
								<span className="quickrun-label">
									<Pin size={11} />
								</span>
								{pinnedMacros.map((macro) => (
									<button
										key={macro.id}
										type="button"
										className={`quickrun-chip quickrun-${macro.source}`}
										title={macro.title ?? `Quick-run ^${macro.macroName}`}
										onClick={() => {
											const snippet = macro.snippet ?? `^${macro.macroName} `;
											onInsertSnippet(snippet);
										}}
									>
										^{macro.macroName}
									</button>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
