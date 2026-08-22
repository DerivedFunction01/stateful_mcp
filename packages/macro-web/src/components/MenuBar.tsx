import type {
	SidepanelPosition,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	Check,
	ChevronRight,
	Columns2,
	Command,
	Copy,
	Eye,
	FilePlus,
	FolderGit2,
	FolderPlus,
	HelpCircle,
	PanelBottom,
	PanelLeft,
	PanelRight,
	Save,
	Settings,
	Sparkles,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatChord, getBrowserShortcutPlatform } from "../lib/bindings";
import { getEffectiveCommandShortcut } from "../lib/browser-workbench-defaults";
import { useI18n } from "../lib/macro-i18n-provider";
import { useTheme, WEB_THEME_IDS } from "../lib/theme";
import type { AppRoute } from "./ActivityRail";
import { Badge, Button } from "./ui/primitives";

export interface MenuActionItem {
	readonly kind?: "action";
	readonly id: string;
	readonly label: string;
	readonly icon?: ReactNode;
	readonly shortcut?: string;
	readonly disabled?: boolean;
	readonly active?: boolean;
	readonly onSelect: () => void;
}

export interface MenuSeparatorItem {
	readonly kind: "separator";
	readonly id: string;
}

export interface MenuSubmenuItem {
	readonly kind: "submenu";
	readonly id: string;
	readonly label: string;
	readonly icon?: ReactNode;
	readonly items: readonly (MenuActionItem | MenuSeparatorItem)[];
}

export type MenuItemConfig =
	| MenuActionItem
	| MenuSeparatorItem
	| MenuSubmenuItem;

export interface MenuCategoryConfig {
	readonly id: string;
	readonly label: string;
	readonly items: readonly MenuItemConfig[];
}

export interface MenuBarProps {
	readonly snapshot?: WorkspaceSnapshot;
	readonly activeDocumentTitle?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly onOpenPalette: () => void;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
	readonly onCloseProject?: () => void;
	readonly onNavigate: (route: AppRoute) => void;
	readonly currentRoute: AppRoute | string;
	readonly extraMenus?: readonly MenuCategoryConfig[];
	readonly isSidebarOpen?: boolean;
	readonly onToggleSidebar?: () => void;
	readonly isDrawerOpen?: boolean;
	readonly onToggleDrawer?: () => void;
	readonly isInspectorOpen?: boolean;
	readonly onToggleInspector?: () => void;
	readonly inspectorPosition?: SidepanelPosition;
	readonly onSetInspectorPosition?: (position: SidepanelPosition) => void;
}

function MenuItemRenderer({
	item,
	onCloseMenu,
}: {
	readonly item: MenuItemConfig;
	readonly onCloseMenu: () => void;
}) {
	const [submenuOpen, setSubmenuOpen] = useState(false);

	if (item.kind === "separator") {
		return <hr key={item.id} className="menu-separator" />;
	}

	if (item.kind === "submenu") {
		return (
			<div
				key={item.id}
				className="menu-submenu-container"
				onMouseEnter={() => setSubmenuOpen(true)}
				onMouseLeave={() => setSubmenuOpen(false)}
			>
				<button
					type="button"
					className="menu-item menu-item-submenu"
					onClick={() => setSubmenuOpen((prev) => !prev)}
					aria-haspopup="true"
					aria-expanded={submenuOpen}
				>
					{item.icon}
					<span>{item.label}</span>
					<ChevronRight size={12} className="submenu-arrow" />
				</button>
				{submenuOpen && (
					<div className="menu-dropdown menu-submenu" role="menu">
						{item.items.map((subItem) => (
							<MenuItemRenderer
								key={subItem.id}
								item={subItem}
								onCloseMenu={onCloseMenu}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<button
			key={item.id}
			type="button"
			className={`menu-item ${item.active ? "active" : ""}`}
			disabled={item.disabled}
			onClick={() => {
				onCloseMenu();
				item.onSelect();
			}}
		>
			{item.icon}
			<span>{item.label}</span>
			{item.shortcut && <kbd className="menu-shortcut">{item.shortcut}</kbd>}
		</button>
	);
}

export function MenuBar({
	snapshot,
	activeDocumentTitle,
	onCommand,
	onOpenPalette,
	onOpenFolderModal,
	onCloseProject,
	onNavigate,
	currentRoute,
	extraMenus = [],
	isSidebarOpen,
	onToggleSidebar,
	isDrawerOpen,
	onToggleDrawer,
	isInspectorOpen,
	onToggleInspector,
	inspectorPosition = "right",
	onSetInspectorPosition,
}: MenuBarProps) {
	const { t } = useI18n();
	const { theme, themeId, setThemeId } = useTheme();
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const menuBarRef = useRef<HTMLDivElement>(null);
	const platform = getBrowserShortcutPlatform();

	const displayShortcut = (shortcut: string | undefined) =>
		shortcut ? formatChord(shortcut, platform) : undefined;

	const toggleTheme = () => {
		const currentIndex = WEB_THEME_IDS.indexOf(themeId);
		const nextThemeId =
			WEB_THEME_IDS[(currentIndex + 1) % WEB_THEME_IDS.length]!;
		setThemeId(nextThemeId);
	};

	const paletteShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workbench.openPalette") ??
			getEffectiveCommandShortcut(snapshot, "workbench.commandPalette") ??
			getEffectiveCommandShortcut(snapshot, "palette.open"),
	);
	const saveShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workspace.saveActive") ??
			getEffectiveCommandShortcut(snapshot, "editor.save"),
	);
	const splitShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "editor.createSplitGroup"),
	);
	const sidepanelShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workspace.toggleSidepanel"),
	);
	const activityShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workspace.toggleActivity"),
	);
	const drawerShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workbench.toggleDrawer"),
	);
	const openProjectShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workbench.openProject"),
	);
	const saveAsShortcut = displayShortcut(
		getEffectiveCommandShortcut(snapshot, "workbench.saveAsProject"),
	);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				menuBarRef.current &&
				!menuBarRef.current.contains(e.target as Node)
			) {
				setActiveMenu(null);
			}
		}
		if (activeMenu) {
			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [activeMenu]);

	const toggleMenu = (name: string) => {
		setActiveMenu(activeMenu === name ? null : name);
	};

	const closeMenu = () => setActiveMenu(null);

	// Declarative menu bar configuration array
	const menuCategories = useMemo<readonly MenuCategoryConfig[]>(() => {
		const fileItems: MenuItemConfig[] = [
			{
				id: "file.newScratchpad",
				label: t("editor.document.new"),
				icon: <FilePlus size={14} />,
				onSelect: () => onCommand("editor.newScratchpad"),
			},
			{
				id: "file.duplicateDocument",
				label: t("editor.document.duplicate"),
				icon: <Copy size={14} />,
				onSelect: () => onCommand("editor.duplicateDocument"),
			},
			{
				id: "file.save",
				label: t("menu.save"),
				icon: <Save size={14} />,
				shortcut: saveShortcut,
				onSelect: () => onCommand("workspace.saveActive"),
			},
			{ kind: "separator", id: "file.sep1" },
			{
				id: "file.openProject",
				label: t("workbench.openProjectTitle"),
				icon: <FolderGit2 size={14} />,
				shortcut: openProjectShortcut,
				onSelect: () => onOpenFolderModal?.("open"),
			},
			{
				id: "file.initProject",
				label: t("workbench.initProjectTitle"),
				icon: <FolderPlus size={14} />,
				onSelect: () => onOpenFolderModal?.("init"),
			},
			{
				id: "file.saveAsProject",
				label: t("workbench.saveAsProjectTitle"),
				icon: <Save size={14} />,
				shortcut: saveAsShortcut,
				onSelect: () => onOpenFolderModal?.("saveAs"),
			},
		];

		if (snapshot?.project && !snapshot.project.ephemeral) {
			fileItems.push({
				id: "file.closeProject",
				label: t("workbench.closeProjectAction"),
				icon: <X size={14} />,
				onSelect: () => onCloseProject?.(),
			});
		}

		fileItems.push(
			{ kind: "separator", id: "file.sep2" },
			{
				id: "file.settings",
				label: t("menu.settings"),
				icon: <Settings size={14} />,
				onSelect: () => onNavigate("settings"),
			},
		);

		const editItems: MenuItemConfig[] = [
			{
				id: "edit.commandPalette",
				label: t("menu.commandPalette"),
				icon: <Command size={14} />,
				shortcut: paletteShortcut,
				onSelect: () => onOpenPalette(),
			},
		];

		const viewItems: MenuItemConfig[] = [
			{
				id: "view.toggleSidepanel",
				label: t("menu.toggleSidepanel"),
				icon: <PanelLeft size={14} />,
				shortcut: sidepanelShortcut,
				onSelect: () =>
					onToggleSidebar?.() ?? onCommand("workspace.toggleSidepanel"),
			},
			{
				id: "view.toggleInspector",
				label: t("workbench.inspector"),
				icon: <PanelRight size={14} />,
				shortcut: sidepanelShortcut,
				onSelect: () => onToggleInspector?.(),
			},
			{
				kind: "submenu",
				id: "view.inspectorPosition",
				label: "Inspector Position",
				icon: <Columns2 size={14} />,
				items: [
					{
						id: "view.posLeft",
						label: "Left Side",
						icon:
							inspectorPosition === "left" ? <Check size={14} /> : undefined,
						onSelect: () => onSetInspectorPosition?.("left"),
					},
					{
						id: "view.posRight",
						label: "Right Side",
						icon:
							inspectorPosition === "right" ? <Check size={14} /> : undefined,
						onSelect: () => onSetInspectorPosition?.("right"),
					},
				],
			},
			{ kind: "separator", id: "view.sep1" },
			{
				id: "view.splitGroup",
				label: t("editor.group.split"),
				icon: <Columns2 size={14} />,
				shortcut: splitShortcut,
				onSelect: () => onCommand("editor.createSplitGroup"),
			},
		];

		const helpItems: MenuItemConfig[] = [
			{
				id: "help.gallery",
				label: t("nav.gallery"),
				icon: <Eye size={14} />,
				onSelect: () => onNavigate("gallery"),
			},
			{
				id: "help.host",
				label: t("app.host"),
				icon: <HelpCircle size={14} />,
				onSelect: () => onNavigate("host"),
			},
		];

		return [
			{ id: "file", label: t("menu.file"), items: fileItems },
			{ id: "edit", label: t("menu.edit"), items: editItems },
			{ id: "view", label: t("menu.view"), items: viewItems },
			{ id: "help", label: t("menu.help"), items: helpItems },
			...extraMenus,
		];
	}, [
		t,
		snapshot?.project,
		openProjectShortcut,
		saveAsShortcut,
		saveShortcut,
		paletteShortcut,
		sidepanelShortcut,
		activityShortcut,
		drawerShortcut,
		splitShortcut,
		inspectorPosition,
		onCommand,
		onOpenFolderModal,
		onCloseProject,
		onNavigate,
		onOpenPalette,
		onToggleSidebar,
		onToggleInspector,
		onSetInspectorPosition,
		extraMenus,
		platform,
	]);

	return (
		<header className="workbench-menubar" ref={menuBarRef}>
			<div className="menubar-left">
				<div className="menubar-brand" title={t("nav.workbench")}>
					<Sparkles size={16} className="brand-icon" />
					<span className="brand-title">Macro</span>
				</div>

				<nav className="menubar-nav" aria-label={t("menu.file")}>
					{menuCategories.map((category) => (
						<div key={category.id} className="menu-dropdown-container">
							<button
								type="button"
								className={`menubar-item ${activeMenu === category.id ? "active" : ""}`}
								onClick={() => toggleMenu(category.id)}
								aria-expanded={activeMenu === category.id}
							>
								{category.label}
							</button>
							{activeMenu === category.id && (
								<div className="menu-dropdown" role="menu">
									{category.items.map((item) => (
										<MenuItemRenderer
											key={item.id}
											item={item}
											onCloseMenu={closeMenu}
										/>
									))}
								</div>
							)}
						</div>
					))}
				</nav>

				{/* Breadcrumb Context */}
				<div className="menubar-breadcrumb">
					<span className="breadcrumb-root">Macro</span>
					<ChevronRight size={12} className="breadcrumb-sep" />
					<span className="breadcrumb-current">
						{currentRoute === "gallery"
							? t("nav.gallery")
							: currentRoute === "settings"
								? t("workspace.tab.settings")
								: currentRoute === "host"
									? t("app.host")
									: (activeDocumentTitle ?? t("nav.workbench"))}
					</span>
				</div>
			</div>

			<div className="menubar-right">
				{/* Top-Right Layout Control Toolbar (VS Code Style) */}
				<div
					className="layout-controls-group"
					role="toolbar"
					aria-label="Layout Controls"
				>
					<button
						type="button"
						className={`layout-toggle-btn ${isSidebarOpen ? "active" : ""}`}
						title={`Toggle Primary Sidebar${activityShortcut ? ` (${activityShortcut})` : ""}`}
						onClick={
							onToggleSidebar ?? (() => onCommand("workspace.toggleActivity"))
						}
						aria-label="Toggle Primary Sidebar"
					>
						<PanelLeft size={14} />
					</button>
					<button
						type="button"
						className={`layout-toggle-btn ${isDrawerOpen ? "active" : ""}`}
						title={`Toggle Output Drawer${drawerShortcut ? ` (${drawerShortcut})` : ""}`}
						onClick={
							onToggleDrawer ?? (() => onCommand("workbench.toggleDrawer"))
						}
						aria-label="Toggle Output Drawer"
					>
						<PanelBottom size={14} />
					</button>
					<button
						type="button"
						className={`layout-toggle-btn ${isInspectorOpen ? "active" : ""}`}
						title={`Toggle Inspector Panel${sidepanelShortcut ? ` (${sidepanelShortcut})` : ""}`}
						onClick={
							onToggleInspector ??
							(() => onCommand("workspace.toggleSidepanel"))
						}
						aria-label="Toggle Inspector Panel"
					>
						<PanelRight size={14} />
					</button>
				</div>

				<button
					type="button"
					className="theme-toggle-btn"
					onClick={toggleTheme}
					title={t("workspace.tab.settings")}
				>
					<Badge tone={theme.mode === "dark" ? "info" : "success"}>
						{theme.label}
					</Badge>
				</button>
				<Button
					variant="ghost"
					icon={<Command size={13} />}
					onClick={() => onOpenPalette()}
				>
					<span>{t("nav.commandPalette")}</span>
					{paletteShortcut && (
						<kbd className="kbd-shortcut">{paletteShortcut}</kbd>
					)}
				</Button>
			</div>
		</header>
	);
}
