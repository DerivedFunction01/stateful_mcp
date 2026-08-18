import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import {
	buildContextualHelpBarHints,
	TuiHelpBar,
} from "../ui/primitives/TuiHelpBar";
import type { TuiThemeDefinition } from "../ui/theme";

export function HelpBar({
	keymap,
	workspace,
	theme,
	twoRow,
}: {
	keymap?: EditorKeymapProfile;
	workspace?: MacroWorkspace;
	theme?: TuiThemeDefinition;
	twoRow?: boolean;
}) {
	const hints = workspace
		? buildContextualHelpBarHints(workspace, keymap)
		: undefined;
	const mode = workspace?.editor.getMode();

	return (
		<TuiHelpBar
			hints={hints}
			keymap={keymap}
			i18n={workspace?.i18n}
			mode={mode}
			theme={theme}
			twoRow={twoRow}
		/>
	);
}
