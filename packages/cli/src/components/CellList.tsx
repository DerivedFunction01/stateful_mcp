import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import { has, t } from "../lib/shared/i18n";
import { CellComponent } from "./Cell";

interface CellListProps {
	cells: StructuredCell[];
	activeIndex: number;
	mode: NotebookEditorMode;
	visualStart: number;
	visualEnd: number;
}

export function CellList({
	cells,
	activeIndex,
	mode,
	visualStart,
	visualEnd,
}: CellListProps) {
	const lo = Math.min(visualStart, visualEnd);
	const hi = Math.max(visualStart, visualEnd);
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
			{cells
				.filter((cell): cell is StructuredCell => Boolean(cell))
				.map((cell, index) => (
					<CellComponent
						key={cell.cellId}
						cell={cell}
						index={index}
						isActive={index === activeIndex}
						isSelected={mode === "VISUAL" && index >= lo && index <= hi}
					/>
				))}
		</Box>
	);
}
