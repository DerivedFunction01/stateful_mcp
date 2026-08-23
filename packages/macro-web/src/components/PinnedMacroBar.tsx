import { Pin, Plus } from "lucide-react";
import { useI18n } from "../lib/macro-i18n-provider";

export interface PinnedMacroBarProps {
	readonly pinnedMacroIds?: readonly string[];
	readonly onInsertMacro?: (macroId: string) => void;
	readonly onOpenMacroPalette?: () => void;
	readonly isReadonly?: boolean;
}

export function PinnedMacroBar({
	pinnedMacroIds = [],
	onInsertMacro,
	onOpenMacroPalette,
	isReadonly = false,
}: PinnedMacroBarProps) {
	const { t } = useI18n();

	if (pinnedMacroIds.length === 0 && isReadonly) {
		return null;
	}

	return (
		<div
			className="pinned-macro-bar"
			role="toolbar"
			aria-label={t("workbench.editor.pinnedMacros")}
		>
			<div className="pinned-bar-label">
				<Pin size={12} className="pinned-label-icon" />
				<span className="pinned-label-text">
					{t("workbench.editor.pinnedMacros")}
				</span>
			</div>

			<div className="pinned-chips-list">
				{pinnedMacroIds.map((macroId) => {
					const verb = macroId.split(":").pop() ?? macroId;
					return (
						<button
							key={macroId}
							type="button"
							className="pinned-bar-chip"
							onClick={() => onInsertMacro?.(macroId)}
							title={macroId}
						>
							<span className="chip-prefix">^</span>
							<span className="chip-verb">{verb}</span>
						</button>
					);
				})}

				{!isReadonly && onOpenMacroPalette && (
					<button
						type="button"
						className="pinned-bar-add-btn"
						onClick={onOpenMacroPalette}
						title={t("workbench.editor.pinMacroPrompt")}
						aria-label={t("workbench.editor.pinMacroPrompt")}
					>
						<Plus size={12} />
					</button>
				)}
			</div>
		</div>
	);
}
