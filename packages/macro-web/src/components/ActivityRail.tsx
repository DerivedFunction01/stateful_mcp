import {
	BookOpen,
	Command,
	Files,
	History,
	type LucideIcon,
	Search,
	Settings2,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n, type WebI18nKey } from "../lib/macro-i18n-provider";

export type AppRoute = "workbench" | "settings" | "gallery" | "host";
export type PrimarySidebarTab = "explorer" | "search" | "journal";

export interface ActivityRailProps {
	readonly currentRoute: AppRoute | string;
	readonly activePrimaryTab?: PrimarySidebarTab;
	readonly isSidebarOpen?: boolean;
	readonly onSelectPrimaryTab?: (tab: PrimarySidebarTab) => void;
	readonly onToggleSidebar?: () => void;
	readonly onNavigate: (route: AppRoute) => void;
}

interface RailItemConfig {
	readonly labelKey: WebI18nKey;
	readonly icon: LucideIcon;
	readonly tab?: PrimarySidebarTab;
	readonly route?: AppRoute;
}

const TOP_RAIL_CONFIG: readonly RailItemConfig[] = [
	{ labelKey: "workbench.explorer", icon: Files, tab: "explorer" },
	{ labelKey: "workbench.search", icon: Search, tab: "search" },
	{ labelKey: "workbench.journalHistory", icon: History, tab: "journal" },
	{ labelKey: "nav.gallery", icon: BookOpen, route: "gallery" },
	{ labelKey: "nav.host", icon: Command, route: "host" },
];

const BOTTOM_RAIL_CONFIG: readonly RailItemConfig[] = [
	{ labelKey: "workspace.tab.settings", icon: Settings2, route: "settings" },
];

export function ActivityRail({
	currentRoute,
	activePrimaryTab = "explorer",
	isSidebarOpen = true,
	onSelectPrimaryTab,
	onToggleSidebar,
	onNavigate,
}: ActivityRailProps) {
	const { t } = useI18n();

	const handlePrimaryTabClick = (tab: PrimarySidebarTab) => {
		if (currentRoute !== "workbench") {
			onNavigate("workbench");
			onSelectPrimaryTab?.(tab);
			return;
		}

		if (activePrimaryTab === tab) {
			onToggleSidebar?.();
		} else {
			onSelectPrimaryTab?.(tab);
			if (!isSidebarOpen) {
				onToggleSidebar?.();
			}
		}
	};

	const isItemActive = (item: RailItemConfig): boolean => {
		if (item.tab) {
			return (
				currentRoute === "workbench" &&
				isSidebarOpen &&
				activePrimaryTab === item.tab
			);
		}
		return currentRoute === item.route;
	};

	const handleItemClick = (item: RailItemConfig) => {
		if (item.tab) {
			handlePrimaryTabClick(item.tab);
		} else if (item.route) {
			onNavigate(item.route);
		}
	};

	return (
		<aside className="activity-rail" aria-label={t("nav.workbench")}>
			<div className="brand-mark" title={t("nav.workbench")}>
				<Sparkles size={20} />
			</div>
			<nav className="rail-top">
				{TOP_RAIL_CONFIG.map((item) => {
					const Icon = item.icon;
					return (
						<NavButton
							key={item.labelKey}
							label={t(item.labelKey)}
							icon={<Icon size={18} />}
							active={isItemActive(item)}
							onClick={() => handleItemClick(item)}
						/>
					);
				})}
			</nav>
			<div className="rail-bottom">
				{BOTTOM_RAIL_CONFIG.map((item) => {
					const Icon = item.icon;
					return (
						<NavButton
							key={item.labelKey}
							label={t(item.labelKey)}
							icon={<Icon size={18} />}
							active={isItemActive(item)}
							onClick={() => handleItemClick(item)}
						/>
					);
				})}
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
