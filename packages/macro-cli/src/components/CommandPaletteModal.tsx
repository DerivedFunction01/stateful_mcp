import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function CommandPaletteModal({ workspace }: { workspace: MacroWorkspace }) {
	const items = workspace.palette.getItems();
	const selected = workspace.palette.getSelectedIndex();
	return (
		<box flexDirection="column" borderStyle="rounded" borderColor="cyan" padding={1}>
			<text attributes={TextAttributes.BOLD} fg="cyan">Command Palette</text>
			<text> &gt; {workspace.palette.getQuery()}</text>
			{items.slice(0, 8).map((item, index) => (
				<text key={item.id} attributes={index === selected ? TextAttributes.INVERSE : 0}>
					{item.category ? `${item.category}: ` : ""}{item.title}
				</text>
			))}
		</box>
	);
}
