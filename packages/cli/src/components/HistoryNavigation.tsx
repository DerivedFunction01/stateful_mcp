import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box } from "ink";
import { CellList } from "./CellList";
import { HistorySearchBar, type HistorySearchResult } from "./HistorySearchBar";
import { useWindowLayout } from "./WindowLayoutContext";

interface HistoryNavigationProps {
	cells: StructuredCell[];
	activeIndex: number;
	mode: "NORMAL" | "INSERT" | "COMMAND" | "MACRO" | "VISUAL";
	visualStart: number;
	visualEnd: number;
	searchQuery?: string;
	searchOpen?: boolean;
	searchMatches?: string[];
	searchMatchIndex?: number;
}

export function HistoryNavigation({
	cells,
	activeIndex,
	mode,
	visualStart,
	visualEnd,
	searchQuery,
	searchOpen = false,
	searchMatches = [],
	searchMatchIndex = -1,
}: HistoryNavigationProps) {
	const layout = useWindowLayout();
	const results: HistorySearchResult[] = searchMatches
		.map((cellId) => {
			const index = cells.findIndex((cell) => cell.cellId === cellId);
			const cell = index >= 0 ? cells[index] : undefined;
			if (!cell) return null;
			return {
				cellId,
				index,
				text: cell.authored.rawText,
			};
		})
		.filter((result): result is HistorySearchResult => result !== null);
	const searchRows = searchOpen ? Math.min(5, results.length + 1) : 1;
	return (
		<Box flexDirection="column" width="100%" height={layout.historyRows}>
			<HistorySearchBar
				open={searchOpen}
				query={searchQuery}
				results={results}
				activeResult={searchMatchIndex}
			/>
			<CellList
				cells={cells}
				activeIndex={activeIndex}
				mode={mode}
				visualStart={visualStart}
				visualEnd={visualEnd}
				viewportRows={Math.max(1, layout.historyRows - searchRows - 1)}
			/>
		</Box>
	);
}
