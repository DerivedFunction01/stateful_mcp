import type { MacroWorkspace } from "@stateful-mcp/macro";
import {
	TuiCommandPalette,
	type TuiPaletteCommand,
} from "../ui/primitives/TuiCommandPalette";
import type { TuiThemeDefinition } from "../ui/theme";

export function CommandPaletteModal({
	workspace,
	width = 68,
	theme,
}: {
	workspace: MacroWorkspace;
	width?: number;
	theme?: TuiThemeDefinition;
}) {
	const items: readonly TuiPaletteCommand[] = workspace.palette
		.getItems()
		.map((item) => ({
			id: item.id,
			title: item.title,
			category: item.category,
			shortcut: item.keybinding,
		}));
	const selected = workspace.palette.getSelectedIndex();
	const query = workspace.palette.getQuery();

	return (
		<TuiCommandPalette
			variant="opencode-bordered"
			query={query}
			items={items}
			selectedIndex={selected}
			onHighlightChange={(index) => workspace.palette.setSelectedIndex(index)}
			onSelect={async (_id, index) => {
				workspace.palette.setSelectedIndex(index);
				await workspace.palette.executeSelected();
			}}
			width={width}
			i18n={workspace.i18n}
			theme={theme}
		/>
	);
}
