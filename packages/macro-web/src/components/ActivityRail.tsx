import { Activity, BookOpen, Command, Settings2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/macro-i18n-provider";

export interface ActivityRailProps {
	readonly currentRoute: string;
	readonly onNavigate: (
		route: "workbench" | "settings" | "gallery" | "host",
	) => void;
}

export function ActivityRail({ currentRoute, onNavigate }: ActivityRailProps) {
	const { t } = useI18n();

	return (
		<aside className="activity-rail" aria-label={t("nav.workbench")}>
			<div className="brand-mark" title="Macro Workbench">
				<Sparkles size={20} />
			</div>
			<nav className="rail-top">
				<NavButton
					label={t("nav.workbench")}
					icon={<Activity size={18} />}
					active={currentRoute === "workbench"}
					onClick={() => onNavigate("workbench")}
				/>
				<NavButton
					label={t("workspace.tab.settings")}
					icon={<Settings2 size={18} />}
					active={currentRoute === "settings"}
					onClick={() => onNavigate("settings")}
				/>
			</nav>
			<div className="rail-bottom">
				<NavButton
					label={t("nav.gallery")}
					icon={<BookOpen size={18} />}
					active={currentRoute === "gallery"}
					onClick={() => onNavigate("gallery")}
				/>
				<NavButton
					label={t("nav.host")}
					icon={<Command size={18} />}
					active={currentRoute === "host"}
					onClick={() => onNavigate("host")}
				/>
			</div>
		</aside>
	);
}

function NavButton({
	label,
	icon,
	active,
	onClick,
}: {
	readonly label: string;
	readonly icon: ReactNode;
	readonly active: boolean;
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={active ? "rail-button active" : "rail-button"}
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			{icon}
		</button>
	);
}
