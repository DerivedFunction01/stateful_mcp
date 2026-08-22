import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Button } from "../ui/primitives";

export interface EditorConflictBannerProps {
	readonly onReload: () => void | Promise<void>;
	readonly onOverwrite: () => void;
}

export function EditorConflictBanner({
	onReload,
	onOverwrite,
}: EditorConflictBannerProps) {
	const { t } = useI18n();

	return (
		<div className="editor-conflict-banner" role="alert">
			<AlertTriangle size={16} />
			<div className="conflict-info">
				<strong>{t("editor.input.conflict.title")}</strong>
				<span>{t("editor.input.conflict.message")}</span>
			</div>
			<div className="conflict-actions">
				<Button
					variant="secondary"
					onClick={() => {
						if (window.confirm(t("editor.input.conflict.reloadConfirm"))) {
							void onReload();
						}
					}}
				>
					{t("editor.input.conflict.reloadHost")}
				</Button>
				<Button variant="primary" onClick={onOverwrite}>
					{t("editor.input.conflict.keepLocal")}
				</Button>
			</div>
		</div>
	);
}
