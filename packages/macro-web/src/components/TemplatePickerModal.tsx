import type { ScratchpadTemplateDescriptor } from "@stateful-mcp/macro-protocol";
import {
	BookTemplate,
	Folder,
	Layers,
	Pin,
	Search,
	Sparkles,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import { Badge, Button } from "./ui/primitives";

export interface TemplatePickerModalProps {
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly templates: readonly ScratchpadTemplateDescriptor[];
	readonly onSelectTemplate: (templateId: string) => void;
}

export function TemplatePickerModal({
	isOpen,
	onClose,
	templates,
	onSelectTemplate,
}: TemplatePickerModalProps) {
	const { t } = useI18n();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

	// Filtered templates matching search query and category
	const filteredTemplates = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		return templates.filter((tmpl) => {
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
			return (
				tmpl.title.toLowerCase().includes(query) ||
				(tmpl.description && tmpl.description.toLowerCase().includes(query)) ||
				(tmpl.sourceExtensionId &&
					tmpl.sourceExtensionId.toLowerCase().includes(query)) ||
				(tmpl.pinnedMacroIds &&
					tmpl.pinnedMacroIds.some((m) => m.toLowerCase().includes(query)))
			);
		});
	}, [templates, searchQuery, selectedCategory]);

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
							{t("workbench.template.picker.title")}
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
							placeholder={t("workbench.template.picker.searchPlaceholder")}
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
							<span>{t("workbench.template.picker.allTemplates")}</span>
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
								<p>{t("workbench.template.picker.empty")}</p>
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
											{tmpl.description && (
												<p className="template-card-desc">{tmpl.description}</p>
											)}
											{tmpl.pinnedMacroIds &&
												tmpl.pinnedMacroIds.length > 0 && (
													<div className="template-card-macros">
														<Pin size={11} />
														<span>
															{tmpl.pinnedMacroIds.length}{" "}
															{t("workbench.template.picker.pinnedMacros")}
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
											{t("workbench.template.picker.sourceExtension", {
												ext: activeTemplate.sourceExtensionId,
											})}
										</span>
									)}
								</div>

								<div className="preview-desc-block">
									<p className="preview-description">
										{activeTemplate.description ||
											t("workbench.template.picker.noDescription")}
									</p>
								</div>

								{activeTemplate.requiresProfile && (
									<div className="preview-profile-badge">
										<Sparkles size={13} />
										<span>
											{t("workbench.template.picker.requiresProfile")}
										</span>
									</div>
								)}

								<div className="preview-pinned-section">
									<div className="preview-section-title">
										<Pin size={13} />
										<span>{t("workbench.template.picker.pinnedMacros")}</span>
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
												{t("workbench.template.picker.noPinnedMacros")}
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
									>
										{t("workbench.template.picker.open")}
									</Button>
								</div>
							</div>
						) : (
							<div className="template-empty-preview">
								<p>{t("workbench.template.picker.empty")}</p>
							</div>
						)}
					</aside>
				</div>
			</div>
		</div>
	);
}
