import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import { getHistoryViewport } from "../lib/editor/history-viewport";
import { has, t } from "../lib/shared/i18n";
import { CellComponent } from "./Cell";

interface CellListProps {
	cells: StructuredCell[];
	activeIndex: number;
	mode: NotebookEditorMode;
	visualStart: number;
	visualEnd: number;
	viewportRows?: number;
}

export function CellList({
	cells,
	activeIndex,
	mode,
	visualStart,
	visualEnd,
	viewportRows,
}: CellListProps) {
	const lo = Math.min(visualStart, visualEnd);
	const hi = Math.max(visualStart, visualEnd);
	const viewport =
		viewportRows === undefined
			? { start: 0, end: cells.length }
			: getHistoryViewport(cells, activeIndex, viewportRows);
	const visibleCells = cells.slice(viewport.start, viewport.end);
	return (
		<Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
			{cells.length === 0 && (
				<Box paddingLeft={2}>
					<Text>
						{has("celllist.empty")
							? t("celllist.empty", { key: t("celllist.empty.key") })
							: "No cells"}
					</Text>
				</Box>
			)}
			{visibleCells
				.filter((cell): cell is StructuredCell => Boolean(cell))
				.map((cell, index) => {
					const cellIndex = viewport.start + index;
					return (
						<CellComponent
							key={cell.cellId}
							cell={cell}
							index={cellIndex}
							isActive={mode !== "INSERT" && cellIndex === activeIndex}
							isSelected={
								mode === "VISUAL" && cellIndex >= lo && cellIndex <= hi
							}
							compact
						/>
					);
				})}
		</Box>
	);
}
