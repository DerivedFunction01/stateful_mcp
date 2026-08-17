import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { TuiHelpBar, type TuiHelpBarVariant } from "../ui/primitives/TuiHelpBar";

export function HelpBar({
	keymap,
	workspace,
	variant = "nano-grid",
}: {
	keymap?: EditorKeymapProfile;
	workspace?: MacroWorkspace;
	variant?: TuiHelpBarVariant;
}) {
	const mode = workspace?.editor.getMode();

	return (
		<TuiHelpBar
			variant={variant}
			keymap={keymap}
			i18n={workspace?.i18n}
			mode={mode}
		/>
	);
}
