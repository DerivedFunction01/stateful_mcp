import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { TuiHelpBar } from "../ui/primitives/TuiHelpBar";

export function HelpBar({
	keymap,
	workspace,
}: {
	keymap?: EditorKeymapProfile;
	workspace?: MacroWorkspace;
}) {
	return (
		<TuiHelpBar
			keymap={keymap}
			i18n={workspace?.i18n}
		/>
	);
}
