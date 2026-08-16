import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function JournalView({ workspace }: { workspace: MacroWorkspace }) {
	const entries = workspace.journal.getEntries();
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>Journal</Text>
			{entries.length === 0 && <Text dimColor>No committed entries.</Text>}
			{entries.map((entry) => (
				<Box key={entry.id} flexDirection="column">
					<Text color={entry.status === "committed" ? "green" : "yellow"}>
						[{entry.status}] {entry.macroName} · line {entry.lineNumber}
					</Text>
					<Text dimColor>  {entry.fingerprint.slice(0, 16)} · {entry.rawText}</Text>
					{entry.reversalReason && <Text color="yellow">  reason: {entry.reversalReason}</Text>}
				</Box>
			))}
		</Box>
	);
}
