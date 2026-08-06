import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import { Box } from "ink";
import { CellList } from "./CellList";
import { HistorySearchBar } from "./HistorySearchBar";
import { useWindowLayout } from "./WindowLayoutContext";

interface HistoryNavigationProps {
	cells: StructuredCell[];
	activeIndex: number;
	mode: "NORMAL" | "INSERT" | "COMMAND" | "MACRO" | "VISUAL";
	visualStart: number;
	visualEnd: number;
	searchQuery?: string;
}

export function HistoryNavigation({
	cells,
	activeIndex,
	mode,
	visualStart,
	visualEnd,
	searchQuery,
}: HistoryNavigationProps) {
	const layout = useWindowLayout();
	return (
		<Box flexDirection="column" width="100%" height={layout.historyRows}>
			<HistorySearchBar query={searchQuery} />
			<CellList
				cells={cells}
				activeIndex={activeIndex}
				mode={mode}
				visualStart={visualStart}
				visualEnd={visualEnd}
				viewportRows={Math.max(1, layout.historyRows - 2)}
			/>
		</Box>
	);
}
