import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import {
	ChevronDown,
	ChevronRight,
	FileText,
	FolderOpen,
	type LucideIcon,
	MoreHorizontal,
	Plus,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type { PrimarySidebarTab } from "../ActivityRail";

type DocumentItem = WorkspaceSnapshot["editor"]["documents"][number];

export interface PrimarySidebarProps {
	readonly activeTab?: PrimarySidebarTab;
	readonly snapshot?: WorkspaceSnapshot;
	readonly documents?: readonly DocumentItem[];
	readonly activeDocumentId?: string | null;
	readonly isOpen?: boolean;
	readonly onSelectDocument?: (documentId: string) => void;
	readonly onCloseDocument?: (documentId: string, textRevision: number) => void;
	readonly onNewScratchpad?: () => void;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
	readonly onCommand?: (command: string, args?: readonly unknown[]) => void;
	readonly onSearchQueryChange?: (query: string) => void;
}

interface HeaderActionConfig {
	readonly id: string;
	readonly getTitle: (t: ReturnType<typeof useI18n>["t"]) => string;
	readonly icon: LucideIcon;
	readonly onClick?: (props: PrimarySidebarProps) => void;
}

interface SidebarPaneHelpers {
	readonly openEditorsCollapsed: boolean;
	readonly setOpenEditorsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	readonly workspaceCollapsed: boolean;
	readonly setWorkspaceCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	readonly searchQuery: string;
	readonly setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	readonly searchReplace: string;
	readonly setSearchReplace: React.Dispatch<React.SetStateAction<string>>;
	readonly t: ReturnType<typeof useI18n>["t"];
}

interface SidebarPaneDescriptor {
	readonly id: PrimarySidebarTab;
	readonly getTitle: (t: ReturnType<typeof useI18n>["t"]) => string;
	readonly actions: readonly HeaderActionConfig[];
	readonly renderBody: (
		props: PrimarySidebarProps,
		helpers: SidebarPaneHelpers,
	) => ReactNode;
}

const SIDEBAR_PANES: Record<PrimarySidebarTab, SidebarPaneDescriptor> = {
	explorer: {
		id: "explorer",
		getTitle: (t) => t("workbench.explorer"),
		actions: [
			{
				id: "newScratchpad",
				getTitle: (t) => t("workbench.newScratchpad"),
				icon: Plus,
				onClick: (p) => p.onNewScratchpad?.(),
			},
			{
				id: "openFolder",
				getTitle: (t) => t("workbench.openProjectAction"),
				icon: FolderOpen,
				onClick: (p) => p.onOpenFolderModal?.("open"),
			},
			{
				id: "more",
				getTitle: (t) => t("workbench.moreActions"),
				icon: MoreHorizontal,
			},
		],
		renderBody: (props, helpers) => {
			const {
				snapshot,
				documents = [],
				activeDocumentId,
				onSelectDocument,
				onCloseDocument,
				onNewScratchpad,
				onOpenFolderModal,
			} = props;
			const {
				openEditorsCollapsed,
				setOpenEditorsCollapsed,
				workspaceCollapsed,
				setWorkspaceCollapsed,
				t,
			} = helpers;

			const projectName = snapshot?.project?.displayName;
			const hasProject =
				Boolean(snapshot?.project?.projectId) &&
				snapshot?.project?.displayName !== "In-Memory Session";

			return (
				<>
					{/* 1. Open Editors Section */}
					<div className="sidebar-accordion-section">
						<button
							type="button"
							className="sidebar-section-header"
							onClick={() => setOpenEditorsCollapsed((prev) => !prev)}
							aria-expanded={!openEditorsCollapsed}
						>
							<span className="section-chevron">
								{openEditorsCollapsed ? (
									<ChevronRight size={13} />
								) : (
									<ChevronDown size={13} />
								)}
							</span>
							<span className="section-title">
								{t("workbench.openEditors").toUpperCase()}
							</span>
						</button>

						{!openEditorsCollapsed && (
							<div className="sidebar-items-list">
								{documents.map((doc) => {
									const isActive = doc.documentId === activeDocumentId;
									return (
										<div
											key={doc.documentId}
											className={`sidebar-doc-item ${isActive ? "active" : ""}`}
											onClick={() => onSelectDocument?.(doc.documentId)}
											role="button"
											tabIndex={0}
										>
											<FileText size={13} className="doc-icon" />
											<span className="doc-name">{doc.title}</span>
											{doc.dirty && <span className="doc-dirty-dot" />}
											<button
												type="button"
												className="doc-close-btn"
												title={t("workbench.close")}
												onClick={(e) => {
													e.stopPropagation();
													onCloseDocument?.(doc.documentId, doc.textRevision);
												}}
											>
												<X size={12} />
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* 2. Workspace / Project Section */}
					<div className="sidebar-accordion-section flex-1">
						<button
							type="button"
							className="sidebar-section-header"
							onClick={() => setWorkspaceCollapsed((prev) => !prev)}
							aria-expanded={!workspaceCollapsed}
						>
							<span className="section-chevron">
								{workspaceCollapsed ? (
									<ChevronRight size={13} />
								) : (
									<ChevronDown size={13} />
								)}
							</span>
							<span className="section-title">
								{hasProject
									? (projectName ?? t("workbench.project")).toUpperCase()
									: t("workbench.noFolderOpened").toUpperCase()}
							</span>
						</button>

						{!workspaceCollapsed && (
							<div className="sidebar-workspace-content">
								{!hasProject ? (
									<div className="no-folder-state">
										<p className="no-folder-description">
											{t("workbench.noFolderDescription")}
										</p>
										<div className="no-folder-actions">
											<button
												type="button"
												className="vscode-btn primary"
												onClick={() => onOpenFolderModal?.("open")}
											>
												{t("workbench.openProjectAction")}
											</button>
											<button
												type="button"
												className="vscode-btn secondary"
												onClick={() => onOpenFolderModal?.("init")}
											>
												{t("workbench.initProject")}
											</button>
											<button
												type="button"
												className="vscode-btn secondary"
												onClick={onNewScratchpad}
											>
												{t("workbench.newScratchpad")}
											</button>
										</div>
									</div>
								) : (
									<div className="workspace-file-tree">
										{documents.map((doc) => (
											<button
												key={doc.documentId}
												type="button"
												className={`file-tree-row ${doc.documentId === activeDocumentId ? "active" : ""}`}
												onClick={() => onSelectDocument?.(doc.documentId)}
											>
												<FileText size={13} />
												<span>{doc.title}</span>
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				</>
			);
		},
	},

	search: {
		id: "search",
		getTitle: (t) => t("workbench.search"),
		actions: [
			{
				id: "refresh",
				getTitle: (t) => t("workbench.refresh"),
				icon: RotateCcw,
			},
		],
		renderBody: (_props, helpers) => {
			const { searchQuery, setSearchQuery, searchReplace, setSearchReplace, t } =
				helpers;
			return (
				<div className="sidebar-search-container">
					<div className="search-input-wrapper">
						<Search size={13} className="search-box-icon" />
						<input
							type="text"
							className="vscode-search-input"
							placeholder={t("workbench.searchPlaceholder")}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
					<div className="search-input-wrapper">
						<input
							type="text"
							className="vscode-search-input"
							placeholder={t("workbench.replacePlaceholder")}
							value={searchReplace}
							onChange={(e) => setSearchReplace(e.target.value)}
						/>
					</div>
				</div>
			);
		},
	},

	journal: {
		id: "journal",
		getTitle: (t) => t("workbench.journalHistory"),
		actions: [
			{
				id: "reverseAll",
				getTitle: (t) => t("workbench.reverseAll"),
				icon: RotateCcw,
				onClick: (p) => p.onCommand?.("journal.reverseAll"),
			},
		],
		renderBody: (_props, helpers) => {
			const { t } = helpers;
			return (
				<div className="sidebar-journal-container">
					<p className="journal-sidebar-hint">{t("workbench.journalHint")}</p>
				</div>
			);
		},
	},
};

export function PrimarySidebar(props: PrimarySidebarProps) {
	const { activeTab = "explorer", isOpen = true } = props;
	const { t } = useI18n();
	const [openEditorsCollapsed, setOpenEditorsCollapsed] = useState(false);
	const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchReplace, setSearchReplace] = useState("");

	if (!isOpen) return null;

	const pane = SIDEBAR_PANES[activeTab] ?? SIDEBAR_PANES.explorer;

	const helpers: SidebarPaneHelpers = {
		openEditorsCollapsed,
		setOpenEditorsCollapsed,
		workspaceCollapsed,
		setWorkspaceCollapsed,
		searchQuery,
		setSearchQuery,
		searchReplace,
		setSearchReplace,
		t,
	};

	return (
		<aside
			className="workbench-primary-sidebar"
			aria-label={t("workbench.views")}
		>
			<div className="sidebar-view-pane">
				<div className="sidebar-view-header">
					<span className="sidebar-view-title">
						{pane.getTitle(t).toUpperCase()}
					</span>
					<div className="sidebar-header-actions">
						{pane.actions.map((action) => {
							const Icon = action.icon;
							return (
								<button
									key={action.id}
									type="button"
									className="sidebar-icon-action"
									title={action.getTitle(t)}
									onClick={() => action.onClick?.(props)}
								>
									<Icon size={14} />
								</button>
							);
						})}
					</div>
				</div>

				{pane.renderBody(props, helpers)}
			</div>
		</aside>
	);
}
