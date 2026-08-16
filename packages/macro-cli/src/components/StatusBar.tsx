import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function StatusBar({ workspace }: { workspace: MacroWorkspace }) {
	const cursor = workspace.editor.buffer.getCursor();
	const mode = workspace.editor.getMode();
	const valid = workspace.scratchpad.getValidLineCount();
	const total = workspace.scratchpad.getTotalLineCount();
	return (
		<Box borderStyle="single" borderTop paddingLeft={1} paddingRight={1}>
			<Text bold color={mode === "NORMAL" ? "green" : "yellow"}>
				{mode}
			</Text>
			<Text> Ln {cursor.line + 1}, Col {cursor.col + 1} </Text>
			<Text> | {valid}/{total} valid </Text>
			{workspace.scratchpad.getPinnedMacro() && (
				<Text color="cyan"> | Pinned: {workspace.scratchpad.getPinnedMacro()}</Text>
			)}
			<Box flexGrow={1} />
			<Text dimColor>{workspace.i18n.getActiveLocale()}</Text>
		</Box>
	);
}
