import { FolderPlus, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Button, TextInput } from "./ui/primitives";

export interface ProjectInitModalProps {
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly currentPath: string;
	readonly onInitProject: (
		rootPath: string,
		displayName?: string,
	) => Promise<void>;
}

export function ProjectInitModal({
	isOpen,
	onClose,
	currentPath,
	onInitProject,
}: ProjectInitModalProps) {
	const { t } = useI18n();
	const defaultName = currentPath.split("/").filter(Boolean).pop() || "";
	const [displayName, setDisplayName] = useState(defaultName);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			await onInitProject(currentPath, displayName.trim() || undefined);
			onClose();
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div
				className="modal-dialog project-init-dialog"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="project-init-title"
			>
				<header className="modal-header">
					<div className="modal-title-row">
						<FolderPlus size={18} className="modal-icon" />
						<h2 id="project-init-title" className="modal-title">
							{t("project.init.title")}
						</h2>
					</div>
					<button
						type="button"
						className="modal-close-btn"
						onClick={onClose}
						aria-label={t("project.init.cancel")}
					>
						<X size={16} />
					</button>
				</header>

				<form onSubmit={handleSubmit} className="project-init-form">
					<div className="project-init-path-preview">
						<span className="path-label">{t("project")}</span>
						<code className="path-value">{currentPath}</code>
					</div>

					<TextInput
						label={t("project.init.projectName")}
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						placeholder={t("project.init.projectPlaceholder")}
					/>

					<div className="modal-actions-row">
						<Button
							type="button"
							variant="secondary"
							onClick={onClose}
							disabled={isSubmitting}
						>
							{t("project.init.cancel")}
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={isSubmitting}
							icon={<FolderPlus size={14} />}
						>
							{t("project.init.submit")}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
