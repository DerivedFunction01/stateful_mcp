import type {
	ScratchpadLineDto,
	ScratchpadTemplateDescriptor,
} from "@stateful-mcp/macro-protocol";
import { FileCode2, Lock, Sparkles } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge } from "../ui/primitives";
import { getLineSlots } from "./inspector-utils";

export interface InspectorTemplateTabProps {
	readonly activeTemplateDescriptor?: ScratchpadTemplateDescriptor | null;
	readonly lines: readonly ScratchpadLineDto[];
	readonly onToggleTemplateLiteralArg?: (
		key: string,
		isLiteral: boolean,
	) => void;
}

export function InspectorTemplateTab({
	activeTemplateDescriptor,
	lines,
	onToggleTemplateLiteralArg,
}: InspectorTemplateTabProps) {
	const { t } = useI18n();
	const nonEmptyLines = lines.filter((l) => l.rawText.trim().length > 0);

	return (
		<div className="inspector-tab-content">
			{/* Template Metadata Summary Header */}
			{activeTemplateDescriptor && (
				<div className="template-inspector-meta-card">
					<div className="meta-card-title-row">
						<strong className="meta-card-title">
							{activeTemplateDescriptor.title}
						</strong>
						<Badge
							tone={
								activeTemplateDescriptor.source === "project"
									? "accent"
									: activeTemplateDescriptor.source === "user"
										? "info"
										: "neutral"
							}
						>
							{activeTemplateDescriptor.source ?? "template"}
						</Badge>
					</div>
					<div className="meta-card-id-row">
						<code>{activeTemplateDescriptor.templateId}</code>
					</div>
					{activeTemplateDescriptor.tags &&
						activeTemplateDescriptor.tags.length > 0 && (
							<div className="meta-card-tags-row">
								{activeTemplateDescriptor.tags.map((tag) => (
									<span key={tag} className="template-mini-tag">
										#{tag}
									</span>
								))}
							</div>
						)}
				</div>
			)}

			{nonEmptyLines.length === 0 ? (
				<div className="inspector-empty-state">
					<FileCode2 size={20} />
					<span>{t("workbench.template.inspector.empty")}</span>
				</div>
			) : (
				<div className="template-slot-lines-list">
					{nonEmptyLines.map((line) => {
						if (!line.macroName) {
							// Plain text / comments / markdown headers in template
							return (
								<div
									key={line.lineNumber}
									className="template-slot-line-card static-line"
								>
									<div className="slot-line-header">
										<span className="slot-line-tag">L{line.lineNumber}</span>
										<Badge tone="neutral">
											{t("workbench.template.inspector.staticText")}
										</Badge>
										<span className="slot-static-notice">
											{t("workbench.template.inspector.fixedNotice")}
										</span>
									</div>
									<div className="slot-static-preview">
										<code>{line.rawText}</code>
									</div>
								</div>
							);
						}

						const slots = getLineSlots(line);
						return (
							<div key={line.lineNumber} className="template-slot-line-card">
								<div className="slot-line-header">
									<span className="slot-line-tag">L{line.lineNumber}</span>
									<strong className="slot-line-macro">^{line.macroName}</strong>
								</div>
								{slots.length === 0 ? (
									<div className="slot-no-args-row">
										<span>{line.rawText}</span>
									</div>
								) : (
									<div className="slot-args-list">
										{slots.map((slot) => {
											const slotKey = `${line.macroName}/${slot.key}`;
											const isLiteral = (
												activeTemplateDescriptor?.templateLiteralArgs ?? []
											).includes(slotKey);
											return (
												<div key={slot.key} className="slot-arg-item">
													<div className="slot-arg-label">
														<span className="slot-arg-key">{slot.key}</span>
														<span className="slot-arg-val">
															= &ldquo;{slot.value}&rdquo;
														</span>
													</div>
													<div className="slot-arg-toggle-group">
														<button
															type="button"
															className={`slot-toggle-btn ${!isLiteral ? "active placeholder" : ""}`}
															onClick={() =>
																onToggleTemplateLiteralArg?.(slotKey, false)
															}
															title={t(
																"workbench.template.inspector.placeholder",
															)}
														>
															<Sparkles size={10} />
															<span>
																{t("workbench.template.inspector.placeholder")}
															</span>
														</button>
														<button
															type="button"
															className={`slot-toggle-btn ${isLiteral ? "active literal" : ""}`}
															onClick={() =>
																onToggleTemplateLiteralArg?.(slotKey, true)
															}
															title={t("workbench.template.inspector.literal")}
														>
															<Lock size={10} />
															<span>
																{t("workbench.template.inspector.literal")}
															</span>
														</button>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
