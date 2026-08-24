import { MoreHorizontal, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type { PrimarySidebarTab } from "../ActivityRail";
import { ExplorerPaneBody } from "./PrimarySidebarExplorer";
import { JournalPaneBody } from "./PrimarySidebarJournal";
import { SearchPaneBody } from "./PrimarySidebarSearch";
import type {
	PrimarySidebarProps,
	SidebarPaneDescriptor,
	SidebarPaneHelpers,
} from "./primary-sidebar-types";

export type { PrimarySidebarProps } from "./primary-sidebar-types";

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
				id: "refresh",
				getTitle: (t) => t("workbench.refresh"),
				icon: RotateCcw,
			},
			{
				id: "more",
				getTitle: (t) => t("workbench.moreActions"),
				icon: MoreHorizontal,
			},
		],
		Body: ExplorerPaneBody,
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
			{
				id: "clear",
				getTitle: (t) => t("workbench.clearSearch"),
				icon: X,
				onClick: () => undefined,
			},
		],
		Body: SearchPaneBody,
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
		Body: JournalPaneBody,
	},
};

export function PrimarySidebar(props: PrimarySidebarProps) {
	const { activeTab = "explorer", isOpen = true } = props;
	const { t } = useI18n();
	const [openEditorsCollapsed, setOpenEditorsCollapsed] = useState(false);
	const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
	const [resourcesCollapsed, setResourcesCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchReplace, setSearchReplace] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [isRegex, setIsRegex] = useState(false);
	const [replaceOpen, setReplaceOpen] = useState(false);
	const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	const toggleFileCollapsed = (docId: string) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(docId)) {
				next.delete(docId);
			} else {
				next.add(docId);
			}
			return next;
		});
	};

	if (!isOpen) return null;

	const pane = SIDEBAR_PANES[activeTab] ?? SIDEBAR_PANES.explorer;
	const PaneBody = pane.Body;

	const helpers: SidebarPaneHelpers = {
		openEditorsCollapsed,
		setOpenEditorsCollapsed,
		workspaceCollapsed,
		setWorkspaceCollapsed,
		resourcesCollapsed,
		setResourcesCollapsed,
		searchQuery,
		setSearchQuery,
		searchReplace,
		setSearchReplace,
		matchCase,
		setMatchCase,
		wholeWord,
		setWholeWord,
		isRegex,
		setIsRegex,
		replaceOpen,
		setReplaceOpen,
		collapsedFiles,
		toggleFileCollapsed,
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

				<PaneBody props={props} helpers={helpers} />
			</div>
		</aside>
	);
}
