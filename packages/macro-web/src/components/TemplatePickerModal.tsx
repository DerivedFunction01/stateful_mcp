import type { ScratchpadTemplateDescriptor } from "@stateful-mcp/macro-protocol";
import {
	BookTemplate,
	FileCode2,
	Folder,
	Layers,
	Pin,
	Search,
	Sparkles,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { matchesTag } from "../../../macro/src/workspace/tags/unicode-tag-resolver";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button } from "./ui/primitives";

export interface TemplatePickerModalProps {
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly templates: readonly ScratchpadTemplateDescriptor[];
	readonly onSelectTemplate: (templateId: string) => void;
	readonly onNewTemplate?: () => void;
	readonly onEditTemplate?: (template: ScratchpadTemplateDescriptor) => void;
	readonly onOpenTemplateInEditor?: (templateId: string) => void;
	readonly onDeleteTemplate?: (template: ScratchpadTemplateDescriptor) => void;
}

export function TemplatePickerModal({
	isOpen,
	onClose,
	templates,
	onSelectTemplate,
	onNewTemplate,
	onEditTemplate,
	onOpenTemplateInEditor,
	onDeleteTemplate,
}: TemplatePickerModalProps) {
	const { t } = useI18n();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
	const tags = useMemo(
		() =>
			[...new Set(templates.flatMap((template) => template.tags ?? []))].sort(),
		[templates],
	);
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
		templates[0]?.templateId ?? null,
	);

	// Group templates into virtual categories
	const categories = useMemo(() => {
		const cats = new Map<string, ScratchpadTemplateDescriptor[]>();
		for (const tmpl of templates) {
			let cat = "general";
			if (tmpl.sourceExtensionId) {
				const match = tmpl.sourceExtensionId.match(
					/@?[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)/,
				);
				cat = match?.[1] ?? tmpl.sourceExtensionId;
			}
			const list = cats.get(cat) ?? [];
			list.push(tmpl);
			cats.set(cat, list);
		}
		return cats;
	}, [templates]);

	// Filtered templates matching search query, category, and selected tags
	const filteredTemplates = useMemo(() => {
		const query = searchQuery.trim();
		return templates.filter((tmpl) => {
			// Tag filter: all selected tags must match at least one tag on the template
			// using locale-agnostic Intl.Collator matching.
			if (
				selectedTags.some(
					(selectedTag) =>
						!(tmpl.tags ?? []).some((templateTag) =>
							matchesTag(selectedTag, templateTag),
						),
				)
			)
				return false;
			if (selectedCategory && selectedCategory !== "all") {
				let cat = "general";
				if (tmpl.sourceExtensionId) {
					const match = tmpl.sourceExtensionId.match(
						/@?[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)/,
					);
					cat = match?.[1] ?? tmpl.sourceExtensionId;
				}
				if (cat !== selectedCategory) return false;
			}
			if (!query) return true;
			// Title/description/source search also uses locale-agnostic matching.
			return (
				matchesTag(query, tmpl.title) ||
				(tmpl.description && matchesTag(query, tmpl.description)) ||
				(tmpl.sourceExtensionId && matchesTag(query, tmpl.sourceExtensionId)) ||
				(tmpl.pinnedMacroIds &&
					tmpl.pinnedMacroIds.some((m) => matchesTag(query, m)))
			);
		});
	}, [templates, searchQuery, selectedCategory, selectedTags]);

	// Active selected template for preview
	const activeTemplate = useMemo(() => {
		if (selectedTemplateId) {
			const found = templates.find((t) => t.templateId === selectedTemplateId);
			if (found) return found;
		}
		return filteredTemplates[0] ?? null;
	}, [templates, selectedTemplateId, filteredTemplates]);

	if (!isOpen) return null;

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div
				className="modal-dialog template-picker-dialog"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="template-picker-title"
			>
				<header className="modal-header">
					<div className="modal-title-row">
						<BookTemplate size={18} className="modal-icon" />
						<h2 id="template-picker-title" className="modal-title">
							{t("templates.picker.title")}
						</h2>
					</div>
					<button
						type="button"
						className="modal-close-btn"
						onClick={onClose}
						aria-label={t("workbench.close")}
					>
						<X size={16} />
					</button>
				</header>

				<div className="template-picker-search-row">
					<div className="search-input-wrapper">
						<Search size={14} className="search-input-icon" />
						<input
							type="text"
							className="template-search-input"
							placeholder={t("templates.picker.searchPlaceholder")}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						{searchQuery && (
							<button
								type="button"
								className="search-clear-btn"
								onClick={() => setSearchQuery("")}
							>
								<X size={12} />
							</button>
						)}
					</div>
					{onNewTemplate && (
						<Button
							variant="primary"
							icon={<BookTemplate size={13} />}
							onClick={onNewTemplate}
						>
							{t("templates.picker.newTemplate")}
						</Button>
					)}
				</div>
				<div className="template-tag-ribbon">
					<Button onClick={() => setSelectedTags([])}>
						{t("templates.picker.allTags")}
					</Button>
					{tags.map((tag) => (
						<Button
							key={tag}
							variant={selectedTags.includes(tag) ? "primary" : "secondary"}
							onClick={() =>
								setSelectedTags(
									selectedTags.includes(tag)
										? selectedTags.filter((item) => item !== tag)
										: [...selectedTags, tag],
								)
							}
						>
							{tag}
						</Button>
					))}
				</div>

				<div className="template-picker-body">
					{/* Virtual Category Tree on the Left */}
					<aside className="template-category-nav">
						<div className="template-nav-section-title">
							{t("workbench.views")}
						</div>
						<button
							type="button"
							className={`template-nav-item ${selectedCategory === null || selectedCategory === "all" ? "active" : ""}`}
							onClick={() => setSelectedCategory("all")}
						>
							<Layers size={14} />
							<span>{t("templates.picker.allTemplates")}</span>
							<span className="template-count-badge">{templates.length}</span>
						</button>

						{[...categories.entries()].map(([catName, list]) => (
							<button
								type="button"
								key={catName}
								className={`template-nav-item ${selectedCategory === catName ? "active" : ""}`}
								onClick={() => setSelectedCategory(catName)}
							>
								<Folder size={14} />
								<span className="category-name">{catName}</span>
								<span className="template-count-badge">{list.length}</span>
							</button>
						))}
					</aside>

					{/* Template Grid / List in the Middle */}
					<div className="template-list-pane">
						{filteredTemplates.length === 0 ? (
							<div className="template-empty-state">
								<p>{t("templates.picker.empty")}</p>
							</div>
						) : (
							<div className="template-cards-list">
								{filteredTemplates.map((tmpl) => {
									const isSelected =
										activeTemplate?.templateId === tmpl.templateId;
									return (
										<div
											key={tmpl.templateId}
											className={`template-card-item ${isSelected ? "selected" : ""}`}
											onClick={() => setSelectedTemplateId(tmpl.templateId)}
											onDoubleClick={() => {
												onSelectTemplate(tmpl.templateId);
												onClose();
											}}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													onSelectTemplate(tmpl.templateId);
													onClose();
												}
											}}
										>
											<div className="template-card-header">
												<strong className="template-card-title">
													{tmpl.title}
												</strong>
												{tmpl.sourceExtensionId && (
													<Badge tone="accent">
														{tmpl.sourceExtensionId.replace(
															/^@stateful-mcp\//,
															"",
														)}
													</Badge>
												)}
											</div>
											{tmpl.tags && (
												<div className="template-card-tags">
													{tmpl.tags.map((tag) => (
														<Badge key={tag}>{tag}</Badge>
													))}
												</div>
											)}
											{tmpl.description && (
												<p className="template-card-desc">{tmpl.description}</p>
											)}
											{tmpl.pinnedMacroIds &&
												tmpl.pinnedMacroIds.length > 0 && (
													<div className="template-card-macros">
														<Pin size={11} />
														<span>
															{tmpl.pinnedMacroIds.length}{" "}
															{t("templates.picker.pinnedMacros")}
														</span>
													</div>
												)}
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* Live Inspector Preview on the Right */}
					<aside className="template-preview-pane">
						{activeTemplate ? (
							<div className="template-preview-content">
								<div className="preview-header">
									<h3 className="preview-title">{activeTemplate.title}</h3>
									{activeTemplate.sourceExtensionId && (
										<span className="preview-source">
											{t("templates.picker.sourceExtension", {
												ext: activeTemplate.sourceExtensionId,
											})}
										</span>
									)}
								</div>

								<div className="preview-desc-block">
									<p className="preview-description">
										{activeTemplate.description ||
											t("templates.picker.noDescription")}
									</p>
								</div>

								{activeTemplate.requiresProfile && (
									<div className="preview-profile-badge">
										<Sparkles size={13} />
										<span>{t("templates.picker.requiresProfile")}</span>
									</div>
								)}

								<div className="preview-pinned-section">
									<div className="preview-section-title">
										<Pin size={13} />
										<span>{t("templates.picker.pinnedMacros")}</span>
									</div>
									<div className="preview-chips-row">
										{activeTemplate.pinnedMacroIds &&
										activeTemplate.pinnedMacroIds.length > 0 ? (
											activeTemplate.pinnedMacroIds.map((macroId) => (
												<span key={macroId} className="pinned-macro-chip">
													^{macroId.split(":").pop() ?? macroId}
												</span>
											))
										) : (
											<span className="no-pinned-text">
												{t("templates.picker.noPinnedMacros")}
											</span>
										)}
									</div>
								</div>

								<div className="preview-action-row">
									<Button
										variant="primary"
										icon={<BookTemplate size={14} />}
										onClick={() => {
											onSelectTemplate(activeTemplate.templateId);
											onClose();
										}}
										style={{ width: "100%", justifyContent: "center" }}
									>
										{t("templates.picker.open")}
									</Button>

									<div className="preview-secondary-actions">
										{activeTemplate.source !== "extension" ? (
											<>
												{onOpenTemplateInEditor && (
													<Button
														variant="secondary"
														icon={<FileCode2 size={13} />}
														onClick={() =>
															onOpenTemplateInEditor(activeTemplate.templateId)
														}
													>
														{t("templates.editor.openInEditor")}
													</Button>
												)}
												{onDeleteTemplate && (
													<Button
														variant="danger"
														onClick={() => onDeleteTemplate(activeTemplate)}
													>
														{t("templates.picker.deleteTemplate")}
													</Button>
												)}
											</>
										) : (
											onEditTemplate && (
												<Button
													variant="secondary"
													onClick={() =>
														onEditTemplate({
															...activeTemplate,
															templateId: `${activeTemplate.templateId.replace(/^@[^:]+:/, "")}_copy`,
															title: `${activeTemplate.title} (Copy)`,
															source: "project",
														})
													}
													style={{
														width: "100%",
														justifyContent: "center",
													}}
												>
													{t("templates.picker.forkTemplate")}
												</Button>
											)
										)}
									</div>
								</div>
							</div>
						) : (
							<div className="template-empty-preview">
								<p>{t("templates.picker.empty")}</p>
							</div>
						)}
					</aside>
				</div>
			</div>
		</div>
	);
}
