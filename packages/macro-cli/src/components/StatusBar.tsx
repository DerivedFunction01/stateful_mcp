import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function StatusBar({ workspace }: { workspace: MacroWorkspace }) {
	const cursor = workspace.editor.buffer.getCursor();
	const mode = workspace.editor.getMode();
	const valid = workspace.scratchpad.getValidLineCount();
	const total = workspace.scratchpad.getTotalLineCount();
	return (
		<box borderStyle="single" paddingLeft={1} paddingRight={1}>
			<text attributes={TextAttributes.BOLD} fg={mode === "NORMAL" ? "green" : "yellow"}>
				{mode}
			</text>
			<text> Ln {cursor.line + 1}, Col {cursor.col + 1} </text>
			<text> | {valid}/{total} valid </text>
			{workspace.scratchpad.getPinnedMacro() && (
				<text fg="cyan"> | Pinned: {workspace.scratchpad.getPinnedMacro()}</text>
			)}
			<box flexGrow={1} />
			<text attributes={TextAttributes.DIM}>{workspace.i18n.getActiveLocale()}</text>
		</box>
	);
}
