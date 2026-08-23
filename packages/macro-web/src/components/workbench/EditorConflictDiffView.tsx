import hljs from "highlight.js/lib/common";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { detectLanguage } from "../EditorSurfaceView";
import { Button } from "../ui/primitives";

export interface EditorConflictDiffViewProps {
	readonly documentId: string;
	readonly filePath?: string;
	readonly title?: string;
	readonly diskLines: readonly string[];
	readonly localLines: readonly string[];
	readonly onReload: () => void | Promise<void>;
	readonly onOverwrite: () => void | Promise<void>;
}

export function EditorConflictDiffView({
	filePath,
	title,
	diskLines,
	localLines,
	onReload,
	onOverwrite,
}: EditorConflictDiffViewProps) {
	const { t } = useI18n();
	const filename = filePath || title || "document";
	const language = detectLanguage(filePath, title);

	const maxLines = Math.max(diskLines.length, localLines.length);

	const renderHighlightedCode = (text: string) => {
		if (!language) return <span>{text || " "}</span>;
		try {
			const highlighted = hljs.highlight(text || " ", {
				language,
				ignoreIllegals: true,
			}).value;
			return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
		} catch {
			return <span>{text || " "}</span>;
		}
	};

	return (
		<section
			className="editor-conflict-diff-view"
			aria-label={t("editor.input.conflict.title")}
		>
			<div className="editor-conflict-diff-header">
				<div className="editor-conflict-diff-header__info">
					<AlertTriangle
						size={18}
						className="editor-conflict-diff-header__icon"
					/>
					<div>
						<strong className="editor-conflict-diff-header__title">
							{t("editor.input.conflict.title")}
						</strong>
						<span className="editor-conflict-diff-header__desc">
							{t("editor.input.conflict.message")}
						</span>
					</div>
				</div>
				<div className="editor-conflict-diff-header__actions">
					<Button
						variant="secondary"
						onClick={() => {
							if (window.confirm(t("editor.input.conflict.reloadConfirm"))) {
								void onReload();
							}
						}}
						className="editor-conflict-diff-btn editor-conflict-diff-btn--revert"
					>
						<RefreshCw size={14} />
						{t("editor.conflict.revertAction")}
					</Button>
					<Button
						variant="primary"
						onClick={() => void onOverwrite()}
						className="editor-conflict-diff-btn editor-conflict-diff-btn--overwrite"
					>
						<Save size={14} />
						{t("editor.conflict.overwriteAction")}
					</Button>
				</div>
			</div>

			<div className="editor-conflict-diff-panes">
				{/* Left Pane: Disk / Host Version (Read-only) */}
				<div className="editor-conflict-pane editor-conflict-pane--disk">
					<div className="editor-conflict-pane__header">
						<span className="editor-conflict-pane__tag editor-conflict-pane__tag--disk">
							{t("editor.conflict.diskVersion")}
						</span>
						<span className="editor-conflict-pane__badge">
							{t("editor.conflict.badgeReadOnly")}
						</span>
					</div>
					<div className="editor-conflict-pane__content">
						<div className="editor-conflict-lines">
							{Array.from({ length: maxLines }).map((_, idx) => {
								const lineText = diskLines[idx];
								const isDiff = lineText !== localLines[idx];
								return (
									<div
										key={`disk-${idx}`}
										className={`editor-conflict-line ${isDiff ? "editor-conflict-line--diff-disk" : ""} ${lineText === undefined ? "editor-conflict-line--empty" : ""}`}
									>
										<span className="editor-conflict-line__number">
											{idx + 1}
										</span>
										<span className="editor-conflict-line__text">
											{lineText !== undefined
												? renderHighlightedCode(lineText)
												: ""}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</div>

				{/* Right Pane: Local Draft (Your Changes) */}
				<div className="editor-conflict-pane editor-conflict-pane--local">
					<div className="editor-conflict-pane__header">
						<span className="editor-conflict-pane__tag editor-conflict-pane__tag--local">
							{t("editor.conflict.localVersion")}
						</span>
						<span className="editor-conflict-pane__badge editor-conflict-pane__badge--modified">
							{t("editor.conflict.badgeModified")}
						</span>
					</div>
					<div className="editor-conflict-pane__content">
						<div className="editor-conflict-lines">
							{Array.from({ length: maxLines }).map((_, idx) => {
								const lineText = localLines[idx];
								const isDiff = lineText !== diskLines[idx];
								return (
									<div
										key={`local-${idx}`}
										className={`editor-conflict-line ${isDiff ? "editor-conflict-line--diff-local" : ""} ${lineText === undefined ? "editor-conflict-line--empty" : ""}`}
									>
										<span className="editor-conflict-line__number">
											{idx + 1}
										</span>
										<span className="editor-conflict-line__text">
											{lineText !== undefined
												? renderHighlightedCode(lineText)
												: ""}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
