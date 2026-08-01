import { Box, Text } from "ink";
import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { EditorMode } from "../lib/keymap";
import { CellComponent } from "./Cell";

interface CellListProps {
	cells: Cell[];
	activeIndex: number;
	mode: EditorMode;
	draftText: string;
	lastEditCellId: string | null;
}

export function CellList({
	cells,
	activeIndex,
	mode,
	draftText,
	lastEditCellId,
}: CellListProps) {
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
				/>
			))}
		</Box>
	);
}