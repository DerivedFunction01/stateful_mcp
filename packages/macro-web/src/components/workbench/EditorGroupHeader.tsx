import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { Columns2, Eraser, Pin, Play, Plus, RotateCcw, X } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface EditorGroupHeaderProps {
	readonly documents: readonly EditorDocumentDto[];
	readonly activeDocumentId?: string | null;
	readonly activeDocument?: ScratchpadSnapshotDto | null;
	readonly canUseVim?: boolean;
	readonly vimEnabled: boolean;
	readonly canSplit?: boolean;
	readonly pendingEditor: boolean;
	readonly hasConflict: boolean;
	readonly hasDraft: boolean;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly onSelectDocument: (documentId: string) => void;
	readonly onRenameDocument: (documentId: string, title: string) => void;
	readonly onCloseDocument: (documentId: string, textRevision: number) => void;
	readonly onNewScratchpad: () => void;
	readonly onToggleVim: () => void;
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
	canUseVim = true,
	vimEnabled,
	canSplit = true,
	pendingEditor,
	hasConflict,
	hasDraft,
	pinnedMacros,
	onSelectDocument,
	onRenameDocument,
	onCloseDocument,
	onNewScratchpad,
	onToggleVim,
	onSplitGroup,
	onExecuteValidLines,
	onClearExecutedLines,
	onResetExecutionState,
	onInsertSnippet,
}: EditorGroupHeaderProps) {
	const { t } = useI18n();

	const isActionDisabled = Boolean(hasConflict || hasDraft || pendingEditor);

	return (
		<div className="editor-group-header">
			<div
				className="workbench-tabs"
				role="tablist"
				aria-label={t("workbench.tabs")}
			>
				{documents.map((document) => (
					<div
						className={`workbench-document-tab ${document.documentId === activeDocumentId ? "active" : ""}`}
						key={document.documentId}
					>
						<button
							className="tab-title-btn"
							type="button"
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
					className={`vim-toggle-btn ${vimEnabled ? "active" : ""}`}
					aria-label={t("editor.toggleVim")}
					aria-pressed={vimEnabled}
					disabled={!canUseVim}
					onClick={onToggleVim}
					title={vimEnabled ? t("editor.vimEnabled") : t("editor.vimDisabled")}
				>
					<span>VIM</span>
				</button>

				<button
					type="button"
					className="editor-split-btn"
					title={t("editor.group.split")}
					disabled={!canSplit || pendingEditor}
					onClick={onSplitGroup}
				>
					<Columns2 size={14} />
				</button>

				{activeDocument && (
					<>
						<button
							type="button"
							className="editor-preview-btn"
							title={t("editor.execution.validLines")}
							disabled={isActionDisabled}
							onClick={onExecuteValidLines}
						>
							<Play size={13} />
							<span>{t("editor.runAll")}</span>
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
