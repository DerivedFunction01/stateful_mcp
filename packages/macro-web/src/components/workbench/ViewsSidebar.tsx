import type { ContributionSnapshotDto } from "@stateful-mcp/macro-protocol";
import { ChevronRight, Files } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface ViewsSidebarProps {
	readonly containers: ContributionSnapshotDto["containers"];
	readonly views: ContributionSnapshotDto["views"];
	readonly activeViewId?: string;
}

export function ViewsSidebar({
	containers,
	views,
	activeViewId,
}: ViewsSidebarProps) {
	const { t } = useI18n();

	return (
		<aside className="workbench-sidebar" aria-label={t("workbench.views")}>
			<div className="workbench-sidebar-heading">
				<span>{t("workbench.views")}</span>
				<Files size={14} />
			</div>
			{containers.map((container) => (
				<div className="view-container" key={container.id}>
					<div className="view-container-title">{container.title}</div>
					{views
						.filter((view) => view.containerId === container.id)
						.map((view) => (
							<button
								className={
									activeViewId === view.id
										? "view-button active"
										: "view-button"
								}
								key={view.id}
								type="button"
							>
								<ChevronRight size={12} /> {view.name}
							</button>
						))}
				</div>
			))}
		</aside>
	);
}
