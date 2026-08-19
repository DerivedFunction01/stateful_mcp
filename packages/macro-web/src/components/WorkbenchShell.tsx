import {
	AlertTriangle,
	Box,
	ChevronRight,
	CircleDot,
	Files,
	PanelRight,
} from "lucide-react";
import { useState } from "react";
import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button } from "./ui/primitives";

export function WorkbenchShell({
	snapshot,
	status = "loading",
	errorMessage,
	onCommand,
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string) => void;
}) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	if (status === "error") {
		return (
			<section className="workbench-state" aria-live="assertive">
				<strong>{t("workbench.unavailable")}</strong>
				<p>{errorMessage ?? t("common.error")}</p>
			</section>
		);
	}
	if (!snapshot) {
		return (
			<section className="workbench-state" aria-live="polite">
				<CircleDot size={28} />
				<strong>{t("common.loading")}</strong>
			</section>
		);
	}

	const activeDomainId = activeDomain ?? snapshot.applications[0]?.id;
	const activeView = snapshot.contributions.views.find(
		(view) => view.containerId === snapshot.layout.activeContainerId,
	);
	return (
		<div className="workbench-shell">
			<aside className="workbench-domain-rail" aria-label={t("workbench.domainApps")}>
				<div className="rail-section-label">{t("workbench.domainApps")}</div>
				{snapshot.applications.map((application) => (
					<button
						className={activeDomainId === application.id ? "domain-button active" : "domain-button"}
						key={application.id}
						type="button"
						onClick={() => setActiveDomain(application.id)}
						title={application.description ?? application.displayName}
					>
						<span className="domain-icon">{application.icon ? <span aria-hidden>{application.icon}</span> : <Box size={15} />}</span>
						<span>{application.displayName}</span>
					</button>
				))}
			</aside>
			<aside className="workbench-sidebar" aria-label={t("workbench.views")}>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.views")}</span>
					<Files size={15} />
				</div>
				{snapshot.contributions.containers.map((container) => (
					<div className="view-container" key={container.id}>
						<div className="view-container-title">{container.title}</div>
						{snapshot.contributions.views
							.filter((view) => view.containerId === container.id)
							.map((view) => (
								<button className={activeView?.id === view.id ? "view-button active" : "view-button"} key={view.id} type="button">
									<ChevronRight size={13} /> {view.name}
								</button>
							))}
					</div>
				))}
			</aside>
			<section className="workbench-center">
				<div className="workbench-tabs" role="tablist" aria-label={t("workbench.tabs")}>
					{snapshot.contributions.tabs.map((tab) => (
						<button
							className={snapshot.activeTabId === tab.id ? "workbench-tab active" : "workbench-tab"}
							key={tab.id}
							type="button"
							onClick={() => tab.id === "settings" && onCommand("workspace.openSettings")}
							role="tab"
							aria-selected={snapshot.activeTabId === tab.id}
						>
							{tab.label}
						</button>
					))}
				</div>
				<div className="workbench-editor-surface">
					<div className="surface-kicker">{t("workbench.editor")}</div>
					<pre>{String(snapshot.scratchpad.text ?? "")}</pre>
					{!snapshot.scratchpad.text && <p>{t("workbench.empty")}</p>}
				</div>
			</section>
			<aside className="workbench-inspector" aria-label={t("workbench.inspector")}>
				<div className="workbench-sidebar-heading"><span>{t("workbench.inspector")}</span><PanelRight size={15} /></div>
				<div className="project-card">
					<span className="field-label">{t("workbench.project")}</span>
					<strong>{snapshot.project?.displayName ?? t("workbench.noProject")}</strong>
					<Badge tone={snapshot.project ? "success" : "warning"}>{snapshot.project?.lifecycle ?? t("workbench.unavailable")}</Badge>
				</div>
				<div className="inspector-card">
					<div className="card-title"><AlertTriangle size={15} /> {t("status.diagnostics")}</div>
					<strong>{snapshot.diagnostics.length}</strong>
				</div>
			</aside>
		</div>
	);
}
