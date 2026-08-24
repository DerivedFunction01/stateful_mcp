import {
	ChevronDown,
	ChevronRight,
	FileText,
	Folder,
	FolderOpen,
	X,
} from "lucide-react";
import { useState } from "react";
import { FileTreeView } from "./FileTreeView";
import type { SidebarPaneProps } from "./primary-sidebar-types";

export function ExplorerPaneBody({ props, helpers }: SidebarPaneProps) {
	const {
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
		resourcesCollapsed,
		setResourcesCollapsed,
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
					<div className="sidebar-items-list sidebar-open-editors-list">
						{documents.map((doc) => {
							const isActive = doc.documentId === activeDocumentId;
							return (
								<div
									key={doc.documentId}
									className={`sidebar-doc-item ${isActive ? "active" : ""}`}
									onClick={() => onSelectDocument?.(doc.documentId)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											onSelectDocument?.(doc.documentId);
										}
									}}
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

			<div className="sidebar-accordion-section sidebar-resource-section">
				<button
					type="button"
					className="sidebar-section-header"
					onClick={() => setResourcesCollapsed((prev) => !prev)}
					aria-expanded={!resourcesCollapsed}
				>
					<span className="section-chevron">
						{resourcesCollapsed ? (
							<ChevronRight size={13} />
						) : (
							<ChevronDown size={13} />
						)}
					</span>
					<span className="section-title">
						{t("workbench.resources").toUpperCase()}
					</span>
				</button>
				{!resourcesCollapsed && (
					<ResourceTreeView
						tree={props.resourceTree ?? []}
						onOpenResource={props.onOpenResource}
					/>
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
										{t("project.openProjectAction")}
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
									<button
										type="button"
										className="vscode-btn secondary"
										onClick={() =>
											props.onCommand?.(
												"workbench.action.newScratchpadFromTemplate",
											)
										}
									>
										{t("templates.picker.newFromTemplate")}
									</button>
								</div>
							</div>
						) : (
							<FileTreeView
								tree={props.projectFileTree ?? []}
								mode="files-and-folders"
								onOpenFile={props.onOpenFile ?? (() => undefined)}
								onRefresh={props.onRefreshFileTree}
								onCreateFile={props.onCreateFile}
								onCreateFolder={props.onCreateFolder}
							/>
						)}
					</div>
				)}
			</div>
		</>
	);
}

function ResourceTreeView({
	tree,
	onOpenResource,
}: {
	readonly tree: readonly import("@stateful-mcp/macro-protocol").ProjectResourceTreeNodeDto[];
	readonly onOpenResource?: (resourceKind: string, resourceId: string) => void;
}) {
	if (tree.length === 0) return null;
	return (
		<div className="resource-tree-view">
			{tree.map((node) => (
				<ResourceTreeNode
					key={node.nodeId}
					node={node}
					depth={0}
					onOpenResource={onOpenResource}
				/>
			))}
		</div>
	);
}

function ResourceTreeNode({
	node,
	depth,
	onOpenResource,
}: {
	readonly node: import("@stateful-mcp/macro-protocol").ProjectResourceTreeNodeDto;
	readonly depth: number;
	readonly onOpenResource?: (resourceKind: string, resourceId: string) => void;
}) {
	const [expanded, setExpanded] = useState(depth === 0);
	const isFolder = node.nodeType === "folder";
	const canOpen =
		!node.disabled &&
		node.resourceKind !== undefined &&
		node.resourceId !== undefined &&
		node.capabilities?.includes("open");
	return (
		<div>
			<div
				className={`resource-tree-row ${node.disabled ? "disabled" : ""}`}
				style={{ paddingLeft: 8 + depth * 12 }}
			>
				{isFolder ? (
					<button
						type="button"
						className="resource-tree-chevron"
						onClick={() => setExpanded((value) => !value)}
						aria-label={expanded ? "Collapse" : "Expand"}
					>
						{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
					</button>
				) : (
					<span className="resource-tree-chevron" />
				)}
				<button
					type="button"
					className="resource-tree-entry"
					disabled={!isFolder && !canOpen}
					title={node.disabledReason}
					onClick={() => {
						if (isFolder) setExpanded((value) => !value);
						else if (canOpen)
							onOpenResource?.(node.resourceKind!, node.resourceId!);
					}}
				>
					{isFolder ? (
						expanded ? (
							<FolderOpen size={15} />
						) : (
							<Folder size={15} />
						)
					) : (
						<FileText size={15} />
					)}
					<span>{node.label}</span>
				</button>
			</div>
			{isFolder &&
				expanded &&
				node.children?.map((child) => (
					<ResourceTreeNode
						key={child.nodeId}
						node={child}
						depth={depth + 1}
						onOpenResource={onOpenResource}
					/>
				))}
		</div>
	);
}
