import type { EditorOutputSnapshotDto } from "@stateful-mcp/macro-protocol";
import { History, PanelBottom } from "lucide-react";
import { useI18n } from "../lib/macro-i18n-provider";

export function EditorOutputDrawer({
	output,
}: {
	readonly output?: EditorOutputSnapshotDto;
}) {
	const { t } = useI18n();
	return (
		<section
			className="editor-output-drawer"
			aria-label={t("editor.output.title")}
		>
			<header className="output-drawer-heading">
				<span>
					<PanelBottom size={14} /> {t("editor.output.title")}
				</span>
				<History size={14} aria-hidden />
			</header>
			{!output?.entries.length ? (
				<span className="panel-empty">{t("editor.output.empty")}</span>
			) : (
				<div className="output-entry-grid">
					{output.entries.map((entry) => (
						<article
							className={`output-entry output-${entry.status}`}
							key={entry.outputId}
						>
							<div>
								<strong>{t(`editor.output.${entry.status}`)}</strong>
								{entry.lineNumber ? <span> · {entry.lineNumber}</span> : null}
							</div>
							{entry.errorCode && <small>{entry.errorCode}</small>}
							{entry.identity && (
								<small>
									{entry.identity.documentId} · r{entry.identity.textRevision}
								</small>
							)}
						</article>
					))}
				</div>
			)}
		</section>
	);
}
