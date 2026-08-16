import { Box, Text } from "ink";

export function HelpBar() {
	return (
		<Box paddingLeft={1}>
			<Text dimColor>Ctrl+P Palette · Ctrl+B Sidepanel · Alt+P Pin · Ctrl+Enter Run · Ctrl+C Quit</Text>
		</Box>
	);
}
