import { FilePlus, FilePlus2, FolderOpen } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface EmptyEditorGroupProps {
	readonly onNewScratchpad: () => void;
	readonly onOpenFile?: () => void;
	readonly onCreateFile?: () => void;
}

export function EmptyEditorGroup({
	onNewScratchpad,
	onOpenFile,
	onCreateFile,
}: EmptyEditorGroupProps) {
	const { t } = useI18n();

	return (
		<section
			className="editor-empty-group"
			aria-label={t("editor.emptyGroup.title")}
		>
			<strong>{t("editor.emptyGroup.title")}</strong>
			<span>{t("editor.emptyGroup.description")}</span>
			<div className="editor-empty-group__actions">
				<button type="button" onClick={onNewScratchpad}>
					<FilePlus size={14} />
					{t("editor.document.new")}
				</button>
				{onOpenFile && (
					<button type="button" onClick={onOpenFile}>
						<FolderOpen size={14} />
						{t("editor.emptyGroup.openFile")}
					</button>
				)}
				{onCreateFile && (
					<button type="button" onClick={onCreateFile}>
						<FilePlus2 size={14} />
						{t("editor.emptyGroup.createFile")}
					</button>
				)}
			</div>
		</section>
	);
}
