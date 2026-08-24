import type { GatedActionDescriptorDto } from "@stateful-mcp/macro-protocol";
import { Download, ExternalLink, Play } from "lucide-react";
import type { I18nFn } from "./journal-types";

export type JournalGatedActionListProps = {
	readonly actions: readonly GatedActionDescriptorDto[];
	readonly t: I18nFn;
	readonly onTriggerAction: (a: GatedActionDescriptorDto) => void;
};

export function JournalGatedActionList({
	actions,
	t,
	onTriggerAction,
}: JournalGatedActionListProps) {
	return (
		<div className="inspector-section">
			<span className="inspector-label">{t("journal.gated.title")}</span>
			<div className="journal-gated-list">
				{actions.map((act) => (
					<button
						key={act.actionId}
						type="button"
						className="journal-gated-btn"
						onClick={() => onTriggerAction(act)}
					>
						{act.kind === "download" ? (
							<Download size={13} />
						) : act.kind === "external" ? (
							<ExternalLink size={13} />
						) : (
							<Play size={13} />
						)}
						<span>{act.label}</span>
					</button>
				))}
			</div>
		</div>
	);
}
