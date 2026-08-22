import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import {
	CaseSensitive,
	ChevronDown,
	ChevronRight,
	FileText,
	FolderOpen,
	type LucideIcon,
	MoreHorizontal,
	Plus,
	Regex,
	Replace,
	RotateCcw,
	Search,
	WholeWord,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useI18n } from "../../lib/macro-i18n-provider";
import type { PrimarySidebarTab } from "../ActivityRail";

type DocumentItem = WorkspaceSnapshot["editor"]["documents"][number];

export interface PrimarySidebarProps {
	readonly activeTab?: PrimarySidebarTab;
	readonly snapshot?: WorkspaceSnapshot;
	readonly documents?: readonly DocumentItem[];
	readonly activeDocumentId?: string | null;
	readonly activeDocumentLines?: readonly string[];
	readonly isOpen?: boolean;
	readonly onSelectDocument?: (documentId: string) => void;
	readonly onCloseDocument?: (documentId: string, textRevision: number) => void;
	readonly onNewScratchpad?: () => void;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
	readonly onCommand?: (command: string, args?: readonly unknown[]) => void;
	readonly onSearchQueryChange?: (query: string) => void;
	readonly onJumpToLine?: (lineNumber: number, col?: number) => void;
	readonly onReplaceAll?: (query: string, replacement: string) => void;
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
	readonly matchCase: boolean;
	readonly setMatchCase: React.Dispatch<React.SetStateAction<boolean>>;
	readonly wholeWord: boolean;
	readonly setWholeWord: React.Dispatch<React.SetStateAction<boolean>>;
	readonly isRegex: boolean;
	readonly setIsRegex: React.Dispatch<React.SetStateAction<boolean>>;
	readonly replaceOpen: boolean;
	readonly setReplaceOpen: React.Dispatch<React.SetStateAction<boolean>>;
	readonly collapsedFiles: ReadonlySet<string>;
	readonly toggleFileCollapsed: (id: string) => void;
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

interface SearchMatchItem {
	readonly lineNumber: number;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly prefix: string;
	readonly matchText: string;
	readonly suffix: string;
}

interface FileSearchResult {
	readonly documentId: string;
	readonly title: string;
	readonly matches: readonly SearchMatchItem[];
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
		renderBody: (props, helpers) => {
			const {
				documents = [],
				activeDocumentId,
				onSelectDocument,
				onCloseDocument,
				onNewScratchpad,
				onOpenFolderModal,
				onCommand,
			} = props;
			const {
				openEditorsCollapsed,
				setOpenEditorsCollapsed,
				workspaceCollapsed,
				setWorkspaceCollapsed,
				t,
			} = helpers;

			return (
				<>
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
								{props.snapshot?.project?.displayName
									? props.snapshot.project.displayName.toUpperCase()
									: t("workbench.noFolderOpened").toUpperCase()}
							</span>
						</button>

						{!workspaceCollapsed && (
							<div className="sidebar-workspace-content">
								{!props.snapshot?.project || props.snapshot.project.ephemeral ? (
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
									<div className="sidebar-file-tree">
										{props.snapshot.project.resources.map((res) => (
											<button
												key={res.resourceId}
												type="button"
												className="file-tree-row"
												onClick={() => onCommand?.("editor.openResource", [res])}
											>
												<FileText size={13} className="doc-icon" />
												<span>{res.resourceId}</span>
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
			{
				id: "clear",
				getTitle: (t) => t("workbench.clearSearch"),
				icon: X,
				onClick: () => undefined,
			},
		],
		renderBody: (props, helpers) => {
			const {
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
			} = helpers;

			const {
				snapshot,
				documents = [],
				activeDocumentLines,
				onSelectDocument,
				onJumpToLine,
				onReplaceAll,
			} = props;

			const searchResults = useMemo<readonly FileSearchResult[]>(() => {
				const query = searchQuery.trim();
				if (!query) return [];

				let matcher: RegExp | null = null;
				try {
					if (isRegex) {
						matcher = new RegExp(query, matchCase ? "g" : "gi");
					} else {
						const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
						matcher = new RegExp(pattern, matchCase ? "g" : "gi");
					}
				} catch {
					return [];
				}

				const results: FileSearchResult[] = [];

				for (const doc of documents) {
					const lines: readonly string[] =
						doc.documentId === snapshot?.editor.activeDocument?.documentId
							? activeDocumentLines ??
								snapshot?.editor.activeDocument?.lines.map((l) => l.rawText) ??
								[]
							: [];

					const fileMatches: SearchMatchItem[] = [];

					lines.forEach((lineText, logicalLineIndex) => {
						matcher!.lastIndex = 0;
						let match: RegExpExecArray | null = null;
						while ((match = matcher!.exec(lineText)) !== null) {
							const start = match.index;
							const end = start + match[0].length;
							const prefix = lineText.slice(Math.max(0, start - 20), start);
							const matchText = match[0];
							const suffix = lineText.slice(
								end,
								Math.min(lineText.length, end + 30),
							);

							fileMatches.push({
								lineNumber: logicalLineIndex + 1,
								startOffset: start,
								endOffset: end,
								prefix,
								matchText,
								suffix,
							});

							if (!matcher!.global) break;
							if (match[0].length === 0) matcher!.lastIndex++;
						}
					});

					if (fileMatches.length > 0) {
						results.push({
							documentId: doc.documentId,
							title: doc.title,
							matches: fileMatches,
						});
					}
				}

				return results;
			}, [
				searchQuery,
				documents,
				snapshot,
				activeDocumentLines,
				matchCase,
				wholeWord,
				isRegex,
			]);

			const totalMatches = searchResults.reduce(
				(sum, r) => sum + r.matches.length,
				0,
			);
			const matchingFilesCount = searchResults.length;

			return (
				<div className="sidebar-search-container">
					<div className="sidebar-search-header">
						<div className="search-input-wrapper">
							<button
								type="button"
								className="search-action-btn"
								title={t("workbench.toggleReplace")}
								onClick={() => setReplaceOpen((o) => !o)}
							>
								{replaceOpen ? (
									<ChevronDown size={13} />
								) : (
									<ChevronRight size={13} />
								)}
							</button>
							<input
								type="text"
								className="vscode-search-input"
								placeholder={t("workbench.searchPlaceholder")}
								value={searchQuery}
								onChange={(e) => {
									setSearchQuery(e.target.value);
									props.onSearchQueryChange?.(e.target.value);
								}}
							/>
							<div className="search-input-actions">
								<button
									type="button"
									className={`search-action-btn ${matchCase ? "active" : ""}`}
									title={t("workbench.matchCase")}
									onClick={() => setMatchCase((c) => !c)}
								>
									<CaseSensitive size={13} />
								</button>
								<button
									type="button"
									className={`search-action-btn ${wholeWord ? "active" : ""}`}
									title={t("workbench.matchWholeWord")}
									onClick={() => setWholeWord((w) => !w)}
								>
									<WholeWord size={13} />
								</button>
								<button
									type="button"
									className={`search-action-btn ${isRegex ? "active" : ""}`}
									title={t("workbench.useRegex")}
									onClick={() => setIsRegex((r) => !r)}
								>
									<Regex size={13} />
								</button>
							</div>
						</div>

						{replaceOpen && (
							<div className="search-input-wrapper">
								<input
									type="text"
									className="vscode-search-input"
									placeholder={t("workbench.replacePlaceholder")}
									value={searchReplace}
									onChange={(e) => setSearchReplace(e.target.value)}
								/>
								<div className="search-input-actions">
									<button
										type="button"
										className="search-action-btn"
										title={t("workbench.replaceAll")}
										disabled={!searchQuery}
										onClick={() => onReplaceAll?.(searchQuery, searchReplace)}
									>
										<Replace size={13} />
									</button>
								</div>
							</div>
						)}
					</div>

					{searchQuery && (
						<div
							className={`sidebar-search-summary ${totalMatches === 0 ? "no-results" : ""}`}
						>
							<span>
								{totalMatches > 0
									? t("workbench.searchResultsSummary", {
											count: totalMatches,
											files: matchingFilesCount,
										})
									: t("workbench.noResultsFound")}
							</span>
						</div>
					)}

					<div className="sidebar-search-results">
						{searchResults.map((fileGroup) => {
							const isCollapsed = collapsedFiles.has(fileGroup.documentId);
							return (
								<div key={fileGroup.documentId} className="search-file-group">
									<button
										type="button"
										className="search-file-header"
										onClick={() => toggleFileCollapsed(fileGroup.documentId)}
									>
										<span className="search-file-title">
											{isCollapsed ? (
												<ChevronRight size={13} />
											) : (
												<ChevronDown size={13} />
											)}
											<FileText size={13} className="doc-icon" />
											<span>{fileGroup.title}</span>
										</span>
										<span className="search-pill-badge">
											{fileGroup.matches.length}
										</span>
									</button>

									{!isCollapsed &&
										fileGroup.matches.map((match, idx) => (
											<div
												key={`${match.lineNumber}-${match.startOffset}-${idx}`}
												className="search-match-row"
												onClick={() => {
													onSelectDocument?.(fileGroup.documentId);
													onJumpToLine?.(match.lineNumber, match.startOffset);
												}}
												role="button"
												tabIndex={0}
											>
												<span className="search-match-line-num">
													{match.lineNumber}
												</span>
												<span className="search-match-text">
													{match.prefix}
													<mark className="search-match-highlight">
														{match.matchText}
													</mark>
													{match.suffix}
												</span>
											</div>
										))}
								</div>
							);
						})}
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

	const helpers: SidebarPaneHelpers = {
		openEditorsCollapsed,
		setOpenEditorsCollapsed,
		workspaceCollapsed,
		setWorkspaceCollapsed,
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

				{pane.renderBody(props, helpers)}
			</div>
		</aside>
	);
}
