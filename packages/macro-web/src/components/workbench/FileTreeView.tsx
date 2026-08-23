import { Icon } from "@iconify/react";
import type { FileTreeItemDto } from "@stateful-mcp/macro-protocol";
import {
	ChevronDown,
	ChevronRight,
	ChevronsDownUp,
	File,
	FilePlus,
	Folder,
	FolderOpen,
	FolderPlus,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { getFileIcon } from "../../lib/file-icon-resolver";
import { useI18n } from "../../lib/macro-i18n-provider";

export function FileEntryIcon({
	name,
	isDirectory,
	isExpanded,
}: {
	name: string;
	isDirectory: boolean;
	isExpanded?: boolean;
}) {
	if (isDirectory)
		return isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />;
	return (
		<Icon
			icon={getFileIcon(name)}
			width={15}
			height={15}
			fallback={<File size={15} />}
		/>
	);
}

const statusLabel: Record<string, string> = {
	modified: "M",
	untracked: "U",
	staged: "A",
	deleted: "D",
};

export type FileTreeMode = "folders" | "files-and-folders";

export function FileTreeView({
	tree,
	onOpenFile,
	onRefresh,
	onCreateFile,
	onCreateFolder,
	onRename,
	onDelete,
	mode = "files-and-folders",
}: {
	tree: readonly FileTreeItemDto[];
	onOpenFile: (path: string) => void;
	onRefresh?: () => void;
	onCreateFile?: (parent: string, name: string) => void;
	onCreateFolder?: (parent: string, name: string) => void;
	onRename?: (item: FileTreeItemDto) => void;
	onDelete?: (item: FileTreeItemDto) => void;
	mode?: FileTreeMode;
}) {
	const { t } = useI18n();
	const [expanded, setExpanded] = useState(() => new Set<string>());
	const [creating, setCreating] = useState<{
		parent: string;
		folder: boolean;
	} | null>(null);
	const [name, setName] = useState("");
	const [selectedFolder, setSelectedFolder] = useState("");
	const beginCreate = (folder: boolean, parent = selectedFolder) => {
		setCreating({ parent, folder });
	};
	const submit = () => {
		if (!creating || !name.trim()) return;
		(creating.folder ? onCreateFolder : onCreateFile)?.(
			creating.parent,
			name.trim(),
		);
		setCreating(null);
		setName("");
	};
	const render = (items: readonly FileTreeItemDto[]) =>
		items.map((item) => {
			if (mode === "folders" && !item.isDirectory) return null;
			const open = expanded.has(item.path);
			return (
				<div key={item.path}>
					<div
						className="file-tree-row"
						style={{ paddingLeft: 6 + item.path.split("/").length * 12 }}
						onContextMenu={(event) => {
							event.preventDefault();
							onRename?.(item);
						}}
					>
						{item.isDirectory ? (
							<button
								type="button"
								className="file-tree-chevron"
								onClick={() =>
									setExpanded((current) => {
										const next = new Set(current);
										open ? next.delete(item.path) : next.add(item.path);
										return next;
									})
								}
							>
								{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
							</button>
						) : (
							<span className="file-tree-chevron" />
						)}
						<button
							type="button"
							className="file-tree-entry"
							onClick={() => {
								if (item.isDirectory) {
									setSelectedFolder(item.path);
									setExpanded((current) => new Set(current).add(item.path));
								} else {
									onOpenFile(item.path);
								}
							}}
						>
							<FileEntryIcon
								name={item.name}
								isDirectory={item.isDirectory}
								isExpanded={open}
							/>
							<span>{item.name}</span>
						</button>
						{item.gitStatus && (
							<span className={`file-tree-git file-tree-git-${item.gitStatus}`}>
								{statusLabel[item.gitStatus]}
							</span>
						)}
						{onDelete && (
							<button
								type="button"
								className="file-tree-delete"
								onClick={() => onDelete(item)}
								aria-label={`Delete ${item.name}`}
							>
								×
							</button>
						)}
					</div>
					{item.isDirectory && open && item.children && render(item.children)}
				</div>
			);
		});
	return (
		<div className="file-tree-view">
			<div
				className="file-tree-toolbar"
				role="toolbar"
				aria-label={t("workbench.fileExplorerActions")}
			>
				<button
					type="button"
					className="file-tree-toolbar-button"
					onClick={onRefresh}
					title={t("workbench.refresh")}
					aria-label={t("workbench.refresh")}
				>
					<RefreshCw size={14} />
				</button>
				<button
					type="button"
					className="file-tree-toolbar-button"
					onClick={() => beginCreate(false)}
					title={t("workbench.newFile")}
					aria-label={t("workbench.newFile")}
				>
					<FilePlus size={14} />
				</button>
				<button
					type="button"
					className="file-tree-toolbar-button"
					onClick={() => beginCreate(true)}
					title={t("workbench.newFolderAction")}
					aria-label={t("workbench.newFolderAction")}
				>
					<FolderPlus size={14} />
				</button>
				<button
					type="button"
					className="file-tree-toolbar-button"
					onClick={() => setExpanded(new Set())}
					title={t("workbench.collapseAll")}
					aria-label={t("workbench.collapseAll")}
				>
					<ChevronsDownUp size={14} />
				</button>
			</div>
			{creating && (
				<input
					className="file-tree-create-input"
					value={name}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") submit();
						if (event.key === "Escape") setCreating(null);
					}}
					onBlur={() => setCreating(null)}
					placeholder={creating.folder ? "Folder name" : "File name"}
				/>
			)}
			{render(tree)}
		</div>
	);
}
