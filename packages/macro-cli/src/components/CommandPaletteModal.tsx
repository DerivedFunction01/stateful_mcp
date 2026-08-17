import type { MacroWorkspace } from "@stateful-mcp/macro";
import { TuiCommandPalette, type TuiPaletteCommand } from "../ui/primitives/TuiCommandPalette";

export function CommandPaletteModal({
	workspace,
	width = 64,
}: {
	workspace: MacroWorkspace;
	width?: number;
}) {
	const items: readonly TuiPaletteCommand[] = workspace.palette.getItems().map((item) => ({
		id: item.id,
		title: item.title,
		category: item.category,
		shortcut: item.keybinding,
	}));
	const selected = workspace.palette.getSelectedIndex();
	const query = workspace.palette.getQuery();

	return (
		<TuiCommandPalette
			query={query}
			items={items}
			selectedIndex={selected}
			width={width}
			i18n={workspace.i18n}
		/>
	);
}
