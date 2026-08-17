import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import {
	buildContextualHelpBarHints,
	TuiHelpBar,
	type TuiHelpBarVariant,
} from "../ui/primitives/TuiHelpBar";
import type { TuiThemeDefinition } from "../ui/theme";

export function HelpBar({
	keymap,
	workspace,
	variant = "nano-grid",
	theme,
}: {
	keymap?: EditorKeymapProfile;
	workspace?: MacroWorkspace;
	variant?: TuiHelpBarVariant;
	theme?: TuiThemeDefinition;
}) {
	const hints = workspace ? buildContextualHelpBarHints(workspace, keymap) : undefined;
	const mode = workspace?.editor.getMode();

	return (
		<TuiHelpBar
			variant={variant}
			hints={hints}
			keymap={keymap}
			i18n={workspace?.i18n}
			mode={mode}
			theme={theme}
		/>
	);
}
