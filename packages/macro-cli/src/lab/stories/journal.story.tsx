import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiBadge } from "../../ui/primitives/TuiBadge";
import { TuiNamedColors } from "../../ui/tokens";

interface MockJournalEntry {
	readonly id: string;
	readonly status: "committed" | "reverted";
	readonly macroName: string;
	readonly lineNumber: number;
	readonly fingerprint: string;
	readonly rawText: string;
	readonly reversalReason?: string;
}

const ENTRIES: readonly MockJournalEntry[] = [
	{
		id: "e1",
		status: "committed",
		macroName: "^deploy",
		lineNumber: 1,
		fingerprint: "a9f8b2c4189e37ad8b",
		rawText: "^deploy service=api env=production",
	},
	{
		id: "e2",
		status: "reverted",
		macroName: "^retail.checkout",
		lineNumber: 2,
		fingerprint: "3bc8910fae78291cd4",
		rawText: "^retail.checkout cartId=901",
		reversalReason: "Payment timeout",
	},
];

export const journalStory: TuiStory = {
	id: "journal",
	title: "Journal & Audit History",
	category: "Views",
	states: ["committed-entries", "empty-journal"],
	render(context) {
		const width = Math.min(60, context.size.columns - 4);
		const isEmpty = context.stateId === "empty-journal";

		return (
			<box flexDirection="column" padding={1} width={width}>
				<box height={1} marginBottom={1}>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						Transaction Journal
					</text>
				</box>
				{isEmpty ? (
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						No committed entries.
					</text>
				) : (
					<box flexDirection="column">
						{ENTRIES.map((entry) => (
							<box key={entry.id} flexDirection="column" marginBottom={1}>
								<box flexDirection="row">
									<TuiBadge
										label={entry.status.toUpperCase()}
										variant={entry.status === "committed" ? "success" : "warning"}
										bracketed
									/>
									<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
										{" "}{entry.macroName} · line {entry.lineNumber}
									</text>
								</box>
								<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
									  {entry.fingerprint.slice(0, 16)} · {entry.rawText}
								</text>
								{entry.reversalReason && (
									<text fg={TuiNamedColors.amber}>
										  reason: {entry.reversalReason}
									</text>
								)}
							</box>
						))}
					</box>
				)}
			</box>
		);
	},
};
