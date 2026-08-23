import { FilePlus, Search } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface EmptyEditorGroupProps {
	readonly onNewScratchpad: () => void;
	readonly onOpenPalette?: () => void;
}

export function EmptyEditorGroup({
	onNewScratchpad,
	onOpenPalette,
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
				{onOpenPalette && (
					<button type="button" onClick={onOpenPalette}>
						<Search size={14} />
						{t("workbench.quickOpen")}
					</button>
				)}
			</div>
		</section>
	);
}
