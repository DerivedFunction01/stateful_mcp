import { Box, Text } from "ink";

export interface HistorySearchResult {
	cellId: string;
	index: number;
	text: string;
}

interface HistorySearchBarProps {
	open: boolean;
	query?: string;
	results?: HistorySearchResult[];
	activeResult?: number;
}

export function HistorySearchBar({
	open,
	query = "",
	results = [],
	activeResult = -1,
}: HistorySearchBarProps) {
	return (
		<Box
			flexDirection="column"
			height={open ? Math.min(5, results.length + 1) : 1}
		>
			<Box paddingLeft={1} height={1} overflow="hidden">
				<Text color={open ? "yellow" : "cyan"}>
					{open ? "/" : "Search history"}
				</Text>
				<Text color="gray">
					{open ? ` ${query}_` : query ? `: ${query}` : " (/ to search)"}
				</Text>
			</Box>
			{open &&
				results.slice(0, 4).map((result, index) => (
					<Box key={result.cellId} paddingLeft={1} height={1} overflow="hidden">
						<Text
							inverse={index === activeResult}
							color="cyan"
							wrap="truncate-end"
						>
							{index === activeResult ? "▸" : " "} [
							{String(result.index + 1).padStart(2, "0")}] {result.text}
						</Text>
					</Box>
				))}
		</Box>
	);
}
