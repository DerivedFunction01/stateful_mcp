import type { DomainApplicationDescriptor } from "@stateful-mcp/macro-protocol";
import { Box } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";

export interface DomainRailProps {
	readonly applications: readonly DomainApplicationDescriptor[];
	readonly activeDomainId?: string;
	readonly onSelectDomain: (domainId: string) => void;
}

export function DomainRail({
	applications,
	activeDomainId,
	onSelectDomain,
}: DomainRailProps) {
	const { t } = useI18n();

	return (
		<aside
			className="workbench-domain-rail"
			aria-label={t("workbench.domainApps")}
		>
			<div className="rail-section-label">{t("workbench.domainApps")}</div>
			{applications.map((application) => (
				<button
					className={
						activeDomainId === application.id
							? "domain-button active"
							: "domain-button"
					}
					key={application.id}
					type="button"
					onClick={() => onSelectDomain(application.id)}
					title={application.description ?? application.displayName}
				>
					<span className="domain-icon">
						{application.icon ? (
							<span aria-hidden>{application.icon}</span>
						) : (
							<Box size={14} />
						)}
					</span>
					<span className="domain-label">{application.displayName}</span>
				</button>
			))}
		</aside>
	);
}
