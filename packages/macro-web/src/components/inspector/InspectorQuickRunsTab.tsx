import type { PinnedMacroDto } from "@stateful-mcp/macro-protocol";
import { BookTemplate, Pin, Plus } from "lucide-react";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge, Button } from "../ui/primitives";

export interface InspectorQuickRunsTabProps {
	readonly pinnedMacros: readonly PinnedMacroDto[];
	readonly onInsertSnippet?: (snippet: string) => void;
	readonly onOpenTemplatePicker?: () => void;
}

export function InspectorQuickRunsTab({
	pinnedMacros,
	onInsertSnippet,
	onOpenTemplatePicker,
}: InspectorQuickRunsTabProps) {
	const { t } = useI18n();

	return (
		<div className="inspector-tab-content">
			<div className="pinned-macros-list">
				<div className="suborder-title">
					{t("workbench.availableQuickRuns")}
				</div>
				{pinnedMacros.length === 0 ? (
					<div className="inspector-empty-state">
						<Pin size={20} />
						<span>{t("workbench.noPinnedMacros")}</span>
					</div>
				) : (
					pinnedMacros.map((macro) => (
						<div className="pinned-macro-card" key={macro.id}>
							<div className="pinned-card-title">
								<div
									style={{
										display: "flex",
										gap: 6,
										alignItems: "center",
									}}
								>
									<Badge
										tone={
											macro.source === "project"
												? "accent"
												: macro.source === "frequent"
													? "info"
													: "neutral"
										}
									>
										{macro.source}
									</Badge>
									<strong>^{macro.macroName}</strong>
								</div>
								{macro.snippet && (
									<Button
										variant="ghost"
										icon={<Plus size={11} />}
										onClick={() => onInsertSnippet?.(macro.snippet!)}
									>
										{t("workbench.insertSnippet")}
									</Button>
								)}
							</div>
							{macro.executionCount !== undefined &&
								macro.executionCount > 0 && (
									<span className="pinned-card-desc">
										{t("workbench.executedCount", {
											count: macro.executionCount,
										})}
									</span>
								)}
						</div>
					))
				)}
				{onOpenTemplatePicker && (
					<div style={{ marginTop: 16 }}>
						<Button
							variant="secondary"
							icon={<BookTemplate size={13} />}
							onClick={onOpenTemplatePicker}
							style={{ width: "100%", justifyContent: "center" }}
						>
							{t("templates.picker.newFromTemplate")}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
