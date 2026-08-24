import type { ScratchpadTemplateDescriptor } from "@stateful-mcp/macro-protocol";
import { Plus, Tag, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button, TextInput } from "./ui/primitives";

export interface TemplateEditorModalProps {
	readonly isOpen: boolean;
	readonly template?: ScratchpadTemplateDescriptor;
	readonly isProjectOpen?: boolean;
	readonly onClose: () => void;
	readonly onSave: (
		template: ScratchpadTemplateDescriptor,
		scope: "project" | "user",
	) => void;
}

export function TemplateEditorModal({
	isOpen,
	template,
	isProjectOpen = true,
	onClose,
	onSave,
}: TemplateEditorModalProps) {
	const { t } = useI18n();
	const [title, setTitle] = useState("");
	const [templateId, setTemplateId] = useState("");
	const [tags, setTags] = useState<readonly string[]>([]);
	const [tagInput, setTagInput] = useState("");
	const [description, setDescription] = useState("");
	const [pinned, setPinned] = useState<readonly string[]>([]);
	const [pinnedInput, setPinnedInput] = useState("");
	const [initialText, setInitialText] = useState("");
	const [scope, setScope] = useState<"project" | "user">("project");

	useEffect(() => {
		if (!isOpen) return;
		setTitle(template?.title ?? "");
		setTemplateId(template?.templateId ?? "");
		setTags(template?.tags ?? []);
		setTagInput("");
		setDescription(template?.description ?? "");
		setPinned(template?.pinnedMacroIds ?? []);
		setPinnedInput("");
		setInitialText(template?.initialText ?? "");
		setScope(
			template?.source === "user" || !isProjectOpen ? "user" : "project",
		);
	}, [template, isOpen, isProjectOpen]);

	const lineCount = useMemo(() => {
		if (!initialText) return 1;
		return initialText.split("\n").length;
	}, [initialText]);

	const lineNumbers = useMemo(() => {
		const count = Math.max(1, lineCount);
		return Array.from({ length: count }, (_, i) => i + 1);
	}, [lineCount]);

	if (!isOpen) return null;

	const handleAddTag = () => {
		const trimmed = tagInput.trim();
		if (trimmed && !tags.includes(trimmed)) {
			setTags([...tags, trimmed]);
			setTagInput("");
		}
	};

	const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddTag();
		}
	};

	const handleRemoveTag = (tagToRemove: string) => {
		setTags(tags.filter((t) => t !== tagToRemove));
	};

	const handleAddPinned = () => {
		const trimmed = pinnedInput.trim();
		if (trimmed && !pinned.includes(trimmed)) {
			setPinned([...pinned, trimmed]);
			setPinnedInput("");
		}
	};

	const handlePinnedKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddPinned();
		}
	};

	const handleRemovePinned = (macroToRemove: string) => {
		setPinned(pinned.filter((m) => m !== macroToRemove));
	};

	const save = () => {
		const finalId =
			templateId.trim() ||
			title.trim().toLowerCase().replace(/\s+/g, "_") ||
			"untitled_template";
		const finalTitle = title.trim() || "Untitled Template";
		onSave(
			{
				templateId: finalId,
				providerId: "macro.text",
				title: finalTitle,
				description: description.trim() || undefined,
				tags: tags.length > 0 ? tags : undefined,
				pinnedMacroIds: pinned.length > 0 ? pinned : undefined,
				initialText,
				source: scope,
			},
			scope,
		);
	};

	const isFork = template?.source === "extension";
	const isCreateMode = !template || isFork;

	// Primary save button label depends on context:
	// - Creating/forking → "Create & Open in Editor" (wizard then opens canvas)
	// - Editing metadata → "Save Template" (just flushes metadata changes)
	const saveLabel = isCreateMode
		? t("templates.editor.createAndOpen")
		: t("templates.editor.saveButton");

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div
				className="modal-dialog template-editor-dialog"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<header className="modal-header">
					<h2 className="modal-title">
						{t(
							isFork
								? "templates.editor.forkTitle"
								: template
									? "templates.editor.editTitle"
									: "templates.editor.createTitle",
							template ? { name: template.title } : undefined,
						)}
					</h2>
					<button
						type="button"
						className="modal-close-btn"
						onClick={onClose}
						aria-label={t("workbench.close")}
					>
						<X size={16} />
					</button>
				</header>

				<div className="template-editor-form">
					<TextInput
						label={t("templates.editor.titleLabel")}
						placeholder={t("templates.editor.titlePlaceholder")}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						autoFocus
					/>

					<TextInput
						label={t("templates.editor.idLabel")}
						hint={t("templates.editor.idHint")}
						placeholder={t("templates.editor.idPlaceholder")}
						value={templateId}
						onChange={(e) => setTemplateId(e.target.value)}
					/>

					<div className="field">
						<span className="field-label">
							{t("templates.editor.tagsLabel")}
						</span>
						<div className="template-chips-field">
							<div className="template-chips-container">
								{tags.map((tag) => (
									<span key={tag} className="template-chip">
										<Badge tone="info">
											<Tag size={11} className="template-chip-icon" />
											<span>{tag}</span>
											<button
												type="button"
												className="template-chip-remove"
												onClick={() => handleRemoveTag(tag)}
												aria-label={t("templates.editor.removeTag", {
													tag,
												})}
											>
												<X size={11} />
											</button>
										</Badge>
									</span>
								))}
							</div>
							<div className="template-chip-input-wrap">
								<input
									type="text"
									className="input template-chip-input"
									placeholder={t("templates.editor.tagsPlaceholder")}
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyDown={handleTagKeyDown}
								/>
								<Button
									variant="ghost"
									icon={<Plus size={13} />}
									onClick={handleAddTag}
									disabled={!tagInput.trim()}
								>
									{t("templates.editor.addTag")}
								</Button>
							</div>
						</div>
					</div>

					<TextInput
						label={t("templates.editor.descriptionLabel")}
						placeholder={t("templates.editor.descriptionPlaceholder")}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>

					<div className="field">
						<span className="field-label">
							{t("templates.editor.pinnedLabel")}
						</span>
						<div className="template-chips-field">
							<div className="template-chips-container">
								{pinned.map((macroId) => (
									<span key={macroId} className="template-chip">
										<Badge tone="accent">
											<span>{macroId}</span>
											<button
												type="button"
												className="template-chip-remove"
												onClick={() => handleRemovePinned(macroId)}
												aria-label={t("templates.editor.removeMacro", {
													macro: macroId,
												})}
											>
												<X size={11} />
											</button>
										</Badge>
									</span>
								))}
							</div>
							<div className="template-chip-input-wrap">
								<input
									type="text"
									className="input template-chip-input"
									placeholder={t("templates.editor.pinnedPlaceholder")}
									value={pinnedInput}
									onChange={(e) => setPinnedInput(e.target.value)}
									onKeyDown={handlePinnedKeyDown}
								/>
								<Button
									variant="ghost"
									icon={<Plus size={13} />}
									onClick={handleAddPinned}
									disabled={!pinnedInput.trim()}
								>
									{t("templates.editor.addMacro")}
								</Button>
							</div>
						</div>
					</div>

					<div className="field">
						<span className="field-label">
							{t("templates.editor.scopeLabel")}
						</span>
						<div className="template-scope-toggle">
							<Button
								variant={scope === "project" ? "primary" : "secondary"}
								onClick={() => setScope("project")}
								disabled={!isProjectOpen}
							>
								{t("templates.editor.scopeProject")}
							</Button>
							<Button
								variant={scope === "user" ? "primary" : "secondary"}
								onClick={() => setScope("user")}
							>
								{t("templates.editor.scopeUser")}
							</Button>
						</div>
					</div>

					<footer className="modal-footer">
						<Button onClick={onClose}>
							{t("templates.editor.cancelButton")}
						</Button>
						<Button variant="primary" onClick={save} disabled={!title.trim()}>
							{saveLabel}
						</Button>
					</footer>
				</div>
			</div>
		</div>
	);
}
