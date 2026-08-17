import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiStatusBar } from "../ui/primitives/TuiStatusBar";
import type { TuiThemeDefinition } from "../ui/theme";

export function StatusBar({
	workspace,
	theme,
}: {
	workspace: MacroWorkspace;
	theme?: TuiThemeDefinition;
}) {
	const cursor = workspace.editor.buffer.getCursor();
	const mode = workspace.editor.getMode();
	const valid = workspace.scratchpad.getValidLineCount();
	const total = workspace.scratchpad.getTotalLineCount();
	const pinned = workspace.scratchpad.getPinnedMacro();
	const locale = workspace.i18n.getActiveLocale();

	return (
		<TuiStatusBar
			variant="lualine"
			mode={mode}
			cursorLine={cursor.line + 1}
			cursorCol={cursor.col + 1}
			validCount={valid}
			totalCount={total}
			pinnedMacro={pinned}
			locale={locale}
			theme={theme}
		/>
	);
}
