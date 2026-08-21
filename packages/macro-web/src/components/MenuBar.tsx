import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import {
	ChevronRight,
	Columns2,
	Command,
	Eye,
	FilePlus,
	HelpCircle,
	PanelRight,
	Save,
	Settings,
	Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getEffectiveCommandShortcut } from "../lib/browser-workbench-defaults";
import { useI18n } from "../lib/macro-i18n-provider";
import { useTheme, WEB_THEME_IDS } from "../lib/theme";
import { Badge, Button } from "./ui/primitives";

export interface MenuBarProps {
	readonly snapshot?: WorkspaceSnapshot;
	readonly activeDocumentTitle?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly onOpenPalette: () => void;
	readonly onNavigate: (
		route: "workbench" | "settings" | "gallery" | "host",
	) => void;
	readonly currentRoute: string;
}

export function MenuBar({
	snapshot,
	activeDocumentTitle,
	onCommand,
	onOpenPalette,
	onNavigate,
	currentRoute,
}: MenuBarProps) {
	const { t } = useI18n();
	const { theme, themeId, setThemeId } = useTheme();
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const menuBarRef = useRef<HTMLDivElement>(null);

	const toggleTheme = () => {
		const currentIndex = WEB_THEME_IDS.indexOf(themeId);
		const nextThemeId =
			WEB_THEME_IDS[(currentIndex + 1) % WEB_THEME_IDS.length]!;
		setThemeId(nextThemeId);
	};

	const paletteShortcut =
		getEffectiveCommandShortcut(snapshot, "workbench.openPalette") ??
		getEffectiveCommandShortcut(snapshot, "workbench.commandPalette") ??
		getEffectiveCommandShortcut(snapshot, "palette.open");
	const saveShortcut =
		getEffectiveCommandShortcut(snapshot, "workspace.saveActive") ??
		getEffectiveCommandShortcut(snapshot, "editor.save");
	const splitShortcut = getEffectiveCommandShortcut(
		snapshot,
		"editor.createSplitGroup",
	);
	const sidepanelShortcut = getEffectiveCommandShortcut(
		snapshot,
		"workspace.toggleSidepanel",
	);
	const newScratchpadShortcut = getEffectiveCommandShortcut(
		snapshot,
		"editor.newScratchpad",
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

	return (
		<header className="workbench-menubar" ref={menuBarRef}>
			<div className="menubar-left">
				<div className="menubar-brand" title={t("nav.workbench")}>
					<Sparkles size={16} className="brand-icon" />
					<span className="brand-title">Macro</span>
				</div>

				<nav className="menubar-nav" aria-label={t("menu.file")}>
					{/* File Menu */}
					<div className="menu-dropdown-container">
						<button
							type="button"
							className={`menubar-item ${activeMenu === "file" ? "active" : ""}`}
							onClick={() => toggleMenu("file")}
							aria-expanded={activeMenu === "file"}
						>
							{t("menu.file")}
						</button>
						{activeMenu === "file" && (
							<div className="menu-dropdown" role="menu">
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onCommand("editor.newScratchpad");
									}}
								>
									<FilePlus size={14} />
									<span>{t("editor.document.new")}</span>
									{newScratchpadShortcut && (
										<kbd className="menu-shortcut">{newScratchpadShortcut}</kbd>
									)}
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onCommand("workspace.saveActive");
									}}
								>
									<Save size={14} />
									<span>{t("menu.save")}</span>
									{saveShortcut && (
										<kbd className="menu-shortcut">{saveShortcut}</kbd>
									)}
								</button>
								<div className="menu-separator" />
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onNavigate("settings");
									}}
								>
									<Settings size={14} />
									<span>{t("menu.settings")}</span>
								</button>
							</div>
						)}
					</div>

					{/* Edit Menu */}
					<div className="menu-dropdown-container">
						<button
							type="button"
							className={`menubar-item ${activeMenu === "edit" ? "active" : ""}`}
							onClick={() => toggleMenu("edit")}
							aria-expanded={activeMenu === "edit"}
						>
							{t("menu.edit")}
						</button>
						{activeMenu === "edit" && (
							<div className="menu-dropdown" role="menu">
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onOpenPalette();
									}}
								>
									<Command size={14} />
									<span>{t("menu.commandPalette")}</span>
									{paletteShortcut && (
										<kbd className="menu-shortcut">{paletteShortcut}</kbd>
									)}
								</button>
							</div>
						)}
					</div>

					{/* View Menu */}
					<div className="menu-dropdown-container">
						<button
							type="button"
							className={`menubar-item ${activeMenu === "view" ? "active" : ""}`}
							onClick={() => toggleMenu("view")}
							aria-expanded={activeMenu === "view"}
						>
							{t("menu.view")}
						</button>
						{activeMenu === "view" && (
							<div className="menu-dropdown" role="menu">
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onCommand("workspace.toggleSidepanel");
									}}
								>
									<PanelRight size={14} />
									<span>{t("menu.toggleSidepanel")}</span>
									{sidepanelShortcut && (
										<kbd className="menu-shortcut">{sidepanelShortcut}</kbd>
									)}
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onCommand("editor.createSplitGroup");
									}}
								>
									<Columns2 size={14} />
									<span>{t("editor.group.split")}</span>
									{splitShortcut && (
										<kbd className="menu-shortcut">{splitShortcut}</kbd>
									)}
								</button>
							</div>
						)}
					</div>

					{/* Help Menu */}
					<div className="menu-dropdown-container">
						<button
							type="button"
							className={`menubar-item ${activeMenu === "help" ? "active" : ""}`}
							onClick={() => toggleMenu("help")}
							aria-expanded={activeMenu === "help"}
						>
							{t("menu.help")}
						</button>
						{activeMenu === "help" && (
							<div className="menu-dropdown" role="menu">
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onNavigate("gallery");
									}}
								>
									<Eye size={14} />
									<span>{t("nav.gallery")}</span>
								</button>
								<button
									type="button"
									className="menu-item"
									onClick={() => {
										closeMenu();
										onNavigate("host");
									}}
								>
									<HelpCircle size={14} />
									<span>{t("app.host")}</span>
								</button>
							</div>
						)}
					</div>
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
