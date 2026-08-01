import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import { Box, Text } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import { CellComponent } from "./Cell";

interface CellListProps {
	cells: Cell[];
	activeIndex: number;
	mode: EditorMode;
	draftText: string;
	lastEditCellId: string | null;
	visualStart: number;
	visualEnd: number;
	cellSuggestions: CellSuggestion[];
}

export function CellList({
	cells,
	activeIndex,
	mode,
	draftText,
	lastEditCellId,
	visualStart,
	visualEnd,
	cellSuggestions,
}: CellListProps) {
	const lo = Math.min(visualStart, visualEnd);
	const hi = Math.max(visualStart, visualEnd);

	return (
		<Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
			{cells.length === 0 && (
				<Box paddingLeft={2}>
					<Text>No cells. Press </Text>
					<Text bold>o</Text>
					<Text> to create one.</Text>
				</Box>
			)}
			{cells.map((cell, i) => (
				<CellComponent
					key={cell.cellId}
					cell={cell}
					index={i}
					isActive={i === activeIndex}
					mode={i === activeIndex ? mode : "NORMAL"}
					draftText={
						i === activeIndex && lastEditCellId === cell.cellId
							? draftText
							: undefined
					}
					isSelected={mode === "VISUAL" && i >= lo && i <= hi}
					suggestions={
						i === activeIndex && mode === "INSERT" ? cellSuggestions : undefined
					}
				/>
			))}
		</Box>
	);
}
