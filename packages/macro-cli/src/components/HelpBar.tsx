import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { TuiHelpBar, type TuiHelpBarVariant } from "../ui/primitives/TuiHelpBar";
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
	const mode = workspace?.editor.getMode();

	return (
		<TuiHelpBar
			variant={variant}
			keymap={keymap}
			i18n={workspace?.i18n}
			mode={mode}
			theme={theme}
		/>
	);
}
