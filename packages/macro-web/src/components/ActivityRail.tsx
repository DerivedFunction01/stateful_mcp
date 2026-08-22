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
import { useI18n } from "../lib/macro-i18n-provider";

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
	readonly id: string;
	readonly getLabel: (t: ReturnType<typeof useI18n>["t"]) => string;
	readonly icon: LucideIcon;
	readonly target:
		| { readonly kind: "primaryTab"; readonly tab: PrimarySidebarTab }
		| {
				readonly kind: "route";
				readonly route: AppRoute;
		  };
}

const TOP_RAIL_CONFIG: readonly RailItemConfig[] = [
	{
		id: "explorer",
		getLabel: (t) => t("workbench.explorer"),
		icon: Files,
		target: { kind: "primaryTab", tab: "explorer" },
	},
	{
		id: "search",
		getLabel: (t) => t("workbench.search"),
		icon: Search,
		target: { kind: "primaryTab", tab: "search" },
	},
	{
		id: "journal",
		getLabel: (t) => t("workbench.journalHistory"),
		icon: History,
		target: { kind: "primaryTab", tab: "journal" },
	},
	{
		id: "gallery",
		getLabel: (t) => t("nav.gallery"),
		icon: BookOpen,
		target: { kind: "route", route: "gallery" },
	},
	{
		id: "host",
		getLabel: (t) => t("nav.host"),
		icon: Command,
		target: { kind: "route", route: "host" },
	},
];

const BOTTOM_RAIL_CONFIG: readonly RailItemConfig[] = [
	{
		id: "settings",
		getLabel: (t) => t("workspace.tab.settings"),
		icon: Settings2,
		target: { kind: "route", route: "settings" },
	},
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
		if (item.target.kind === "primaryTab") {
			return (
				currentRoute === "workbench" &&
				isSidebarOpen &&
				activePrimaryTab === item.target.tab
			);
		}
		return currentRoute === item.target.route;
	};

	const handleItemClick = (item: RailItemConfig) => {
		if (item.target.kind === "primaryTab") {
			handlePrimaryTabClick(item.target.tab);
		} else {
			onNavigate(item.target.route);
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
							key={item.id}
							label={item.getLabel(t)}
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
							key={item.id}
							label={item.getLabel(t)}
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
