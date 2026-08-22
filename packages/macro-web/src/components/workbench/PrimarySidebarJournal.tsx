import type { SidebarPaneProps } from "./primary-sidebar-types";

export function JournalPaneBody({ helpers }: SidebarPaneProps) {
	const { t } = helpers;
	return (
		<div className="sidebar-journal-container">
			<p className="journal-sidebar-hint">{t("workbench.journalHint")}</p>
		</div>
	);
}
