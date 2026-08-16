import { Box, Text } from "ink";
import type { MacroWorkspace } from "@stateful-mcp/macro";

export function CommandPaletteModal({ workspace }: { workspace: MacroWorkspace }) {
	const items = workspace.palette.getItems();
	const selected = workspace.palette.getSelectedIndex();
	return (
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
			<Text bold color="cyan">Command Palette</Text>
			<Text> &gt; {workspace.palette.getQuery()}</Text>
			{items.slice(0, 8).map((item, index) => (
				<Text key={item.id} inverse={index === selected}>
					{item.category ? `${item.category}: ` : ""}{item.title}
				</Text>
			))}
		</Box>
	);
}
