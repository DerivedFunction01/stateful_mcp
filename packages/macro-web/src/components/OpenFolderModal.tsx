import {
	AlertCircle,
	ArrowUp,
	Download,
	Folder,
	FolderGit2,
	FolderPlus,
	Loader2,
	Search,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trapFocus } from "../lib/focus-trap";
import type { FsBrowseResult, HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button, ModalOverlay, ModalSurface } from "./ui/primitives";

export interface OpenFolderModalProps {
	readonly mode: "open" | "init" | "saveAs";
	readonly client: HostClient;
	readonly initialPath?: string;
	readonly onSelect: (path: string) => void | Promise<void>;
	readonly onClose: () => void;
}

export function OpenFolderModal({
	mode,
	client,
	initialPath,
	onSelect,
	onClose,
}: OpenFolderModalProps) {
	const { t } = useI18n();
	const [currentPath, setCurrentPath] = useState(initialPath || "");
	const [parentPath, setParentPath] = useState<string | null>(null);
	const [pathInput, setPathInput] = useState(initialPath || "");
	const [entries, setEntries] = useState<FsBrowseResult["entries"]>([]);
	const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [creatingDirectory, setCreatingDirectory] = useState(false);
	const [directoryName, setDirectoryName] = useState("");
	const [creating, setCreating] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const loadPath = async (targetPath?: string) => {
		setLoading(true);
		setError(undefined);
		try {
			const result = await client.browseFs(targetPath);
			setCurrentPath(result.currentPath);
			setParentPath(result.parentPath);
			setPathInput(result.currentPath);
			setEntries(result.entries);
			setSelectedEntry(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadPath(initialPath);
		inputRef.current?.focus();
	}, [initialPath]);

	useEffect(() => {
		if (creatingDirectory) nameInputRef.current?.focus();
	}, [creatingDirectory]);

	const startCreate = () => {
		setCreatingDirectory(true);
		setDirectoryName("");
		setError(undefined);
	};

	const cancelCreate = () => {
		setCreatingDirectory(false);
		setDirectoryName("");
		setError(undefined);
	};

	const handleCreateDirectory = async () => {
		const name = directoryName.trim();
		if (!name) {
			setError(t("workbench.newFolderNameRequired"));
			return;
		}
		setCreating(true);
		setError(undefined);
		try {
			const result = await client.createDirectory(currentPath, name);
			const sep = result.path.includes("\\") ? "\\" : "/";
			const createdName = result.path.split(sep).filter(Boolean).pop() ?? name;
			await loadPath(currentPath);
			setSelectedEntry(createdName);
			setCreatingDirectory(false);
			setDirectoryName("");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreating(false);
		}
	};

	const title =
		mode === "init"
			? t("workbench.initProjectTitle")
			: mode === "saveAs"
				? t("workbench.saveAsProjectTitle")
				: t("workbench.openProjectTitle");

	const actionLabel =
		mode === "init"
			? t("workbench.initProjectAction")
			: mode === "saveAs"
				? t("workbench.saveProjectAction")
				: t("workbench.openProjectAction");

	const handleNavigate = (entryName: string) => {
		const sep = currentPath.includes("\\") ? "\\" : "/";
		const newPath = currentPath.endsWith(sep)
			? `${currentPath}${entryName}`
			: `${currentPath}${sep}${entryName}`;
		void loadPath(newPath);
	};

	const handleParent = () => {
		if (parentPath) void loadPath(parentPath);
	};

	const handleSubmit = async () => {
		const target = selectedEntry
			? (() => {
					const sep = currentPath.includes("\\") ? "\\" : "/";
					return currentPath.endsWith(sep)
						? `${currentPath}${selectedEntry}`
						: `${currentPath}${sep}${selectedEntry}`;
				})()
			: currentPath;
		if (!target) return;
		setSubmitting(true);
		setError(undefined);
		try {
			await onSelect(target);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSubmitting(false);
		}
	};

	const handleDownloadLocal = () => {
		const snapshot = client.getCachedSnapshot?.();
		const dataStr =
			"data:text/json;charset=utf-8," +
			encodeURIComponent(JSON.stringify(snapshot, null, 2));
		const downloadAnchor = document.createElement("a");
		downloadAnchor.setAttribute("href", dataStr);
		downloadAnchor.setAttribute("download", "macro-workspace-backup.json");
		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
	};

	return (
		<ModalOverlay role="presentation">
			<ModalSurface
				ref={dialogRef}
				className="modal-card open-folder-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="folder-picker-title"
				tabIndex={-1}
				onKeyDown={(event) => {
					trapFocus(event, dialogRef.current);
					if (event.key === "Escape") {
						event.preventDefault();
						if (creatingDirectory) {
							cancelCreate();
						} else {
							onClose();
						}
					}
				}}
			>
				<div className="modal-header-row">
					<h2 id="folder-picker-title" className="modal-title">
						{mode === "init" ? (
							<FolderPlus size={18} />
						) : (
							<FolderGit2 size={18} />
						)}
						<span>{title}</span>
					</h2>
					<button
						type="button"
						className="icon-button"
						aria-label={t("editor.find.close")}
						onClick={onClose}
					>
						<X size={16} />
					</button>
				</div>

				<form
					className="folder-path-form"
					onSubmit={(e) => {
						e.preventDefault();
						void loadPath(pathInput);
					}}
				>
					<div className="folder-input-wrapper">
						<Search size={14} className="folder-input-icon" />
						<input
							ref={inputRef}
							type="text"
							className="folder-path-input"
							value={pathInput}
							onChange={(e) => setPathInput(e.target.value)}
							placeholder={t("workbench.pathPlaceholder")}
						/>
					</div>
					<Button
						type="submit"
						variant="secondary"
						disabled={loading || !pathInput.trim()}
					>
						{loading ? (
							<Loader2 size={14} className="spin" />
						) : (
							t("editor.find.findAction")
						)}
					</Button>
				</form>

				{error && (
					<div className="modal-error-banner" role="alert">
						<AlertCircle size={14} />
						<span>{error}</span>
					</div>
				)}

				{creatingDirectory ? (
					<form
						className="new-folder-form"
						onSubmit={(event) => {
							event.preventDefault();
							void handleCreateDirectory();
						}}
					>
						<input
							ref={nameInputRef}
							type="text"
							className="folder-path-input new-folder-input"
							value={directoryName}
							onChange={(event) => setDirectoryName(event.target.value)}
							placeholder={t("workbench.newFolderPlaceholder")}
							aria-label={t("workbench.newFolderNameLabel")}
							disabled={creating || loading || submitting}
						/>
						<Button
							type="submit"
							variant="secondary"
							disabled={
								creating || loading || submitting || !directoryName.trim()
							}
						>
							{creating ? (
								<Loader2 size={14} className="spin" />
							) : (
								t("workbench.newFolderCreate")
							)}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={cancelCreate}
							disabled={creating}
						>
							{t("editor.find.close")}
						</Button>
					</form>
				) : (
					<div className="new-folder-toolbar">
						<Button
							type="button"
							variant="ghost"
							icon={<FolderPlus size={14} />}
							onClick={startCreate}
							disabled={loading || submitting}
						>
							{t("workbench.newFolderAction")}
						</Button>
					</div>
				)}

				<div
					className="folder-entries-container"
					role="listbox"
					aria-label={t("workbench.project")}
				>
					{parentPath && (
						<button
							type="button"
							className="folder-entry-row parent-row"
							onClick={handleParent}
							role="option"
							aria-selected={false}
						>
							<ArrowUp size={14} />
							<span className="folder-entry-name">..</span>
							<span className="folder-entry-hint">
								{t("workbench.parentDirectory")}
							</span>
						</button>
					)}

					{loading ? (
						<div className="folder-loading-state">
							<Loader2 size={18} className="spin" />
							<span>{t("common.loading")}</span>
						</div>
					) : entries.length === 0 ? (
						<div className="folder-empty-state">
							<span>{t("workbench.noDirectoriesFound")}</span>
						</div>
					) : (
						entries.map((entry) => {
							const isSelected = selectedEntry === entry.name;
							return (
								<button
									key={entry.name}
									type="button"
									className={`folder-entry-row ${isSelected ? "selected" : ""}`}
									onClick={() =>
										setSelectedEntry(isSelected ? null : entry.name)
									}
									onDoubleClick={() => handleNavigate(entry.name)}
									role="option"
									aria-selected={isSelected}
								>
									{entry.isMacroProject ? (
										<FolderGit2 size={15} className="macro-proj-icon" />
									) : (
										<Folder size={15} />
									)}
									<span className="folder-entry-name">{entry.name}</span>
									{entry.isMacroProject ? (
										<Badge tone="accent">
											{t("workbench.macroProjectBadge")}
										</Badge>
									) : (
										<span className="folder-entry-type">
											{t("workbench.directoryBadge")}
										</span>
									)}
								</button>
							);
						})
					)}
				</div>

				<div className="modal-actions-bar">
					<Button
						type="button"
						variant="ghost"
						icon={<Download size={14} />}
						onClick={handleDownloadLocal}
					>
						{t("workbench.showLocalAction")}
					</Button>
					<div className="action-buttons-right">
						<Button type="button" variant="ghost" onClick={onClose}>
							{t("editor.find.close")}
						</Button>
						<Button
							type="button"
							variant="primary"
							disabled={loading || submitting || !currentPath}
							onClick={() => void handleSubmit()}
						>
							{submitting ? <Loader2 size={14} className="spin" /> : null}
							<span>{actionLabel}</span>
						</Button>
					</div>
				</div>
			</ModalSurface>
		</ModalOverlay>
	);
}
