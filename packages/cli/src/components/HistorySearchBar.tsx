import { Box, Text } from "ink";

export function HistorySearchBar({ query = "" }: { query?: string }) {
	return (
		<Box paddingLeft={1} height={1} overflow="hidden">
			<Text color="cyan">Search history</Text>
			<Text color="gray"> {query ? `: ${query}` : " (/ to search)"}</Text>
		</Box>
	);
}
