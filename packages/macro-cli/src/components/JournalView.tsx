import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function JournalView({ workspace }: { workspace: MacroWorkspace }) {
	const entries = workspace.journal.getEntries();
	return (
		<box flexDirection="column" padding={1}>
			<text attributes={TextAttributes.BOLD}>Journal</text>
			{entries.length === 0 && <text attributes={TextAttributes.DIM}>No committed entries.</text>}
			{entries.map((entry) => (
				<box key={entry.id} flexDirection="column">
					<text fg={entry.status === "committed" ? "green" : "yellow"}>
						[{entry.status}] {entry.macroName} · line {entry.lineNumber}
					</text>
					<text attributes={TextAttributes.DIM}>  {entry.fingerprint.slice(0, 16)} · {entry.rawText}</text>
					{entry.reversalReason && <text fg="yellow">  reason: {entry.reversalReason}</text>}
				</box>
			))}
		</box>
	);
}
