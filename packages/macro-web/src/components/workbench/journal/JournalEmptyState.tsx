import { History } from "lucide-react";
import type { I18nFn } from "./journal-types";

export function JournalEmptyState({ t }: { readonly t: I18nFn }) {
	return (
		<div className="journal-empty-state">
			<History size={32} className="journal-empty-icon" />
			<h4 className="journal-empty-title">{t("journal.empty")}</h4>
			<p className="journal-empty-description">
				{t("journal.empty.description")}
			</p>
		</div>
	);
}
