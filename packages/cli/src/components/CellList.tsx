import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text } from "ink";
import type { CellSuggestion } from "../hooks/useNotebook";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import { has, t } from "../lib/shared/i18n";
import { CellComponent } from "./Cell";

interface CellListProps {
	cells: StructuredCell[];
	activeIndex: number;
	mode: NotebookEditorMode;
	draftText: string;
	lastEditCellId: string | null;
	visualStart: number;
	visualEnd: number;
	cellSuggestions: CellSuggestion[];
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	cursorOffset?: number;
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
	macroSlots,
	activeMacroArgumentId,
	cursorOffset,
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
						mode={mode}
						draftText={index === activeIndex ? draftText : undefined}
						isSelected={mode === "VISUAL" && index >= lo && index <= hi}
						suggestions={
							cell.cellId === lastEditCellId ? cellSuggestions : undefined
						}
						macroSlots={index === activeIndex ? macroSlots : undefined}
						activeMacroArgumentId={
							index === activeIndex ? activeMacroArgumentId : undefined
						}
						cursorOffset={index === activeIndex ? cursorOffset : undefined}
					/>
				))}
		</Box>
	);
}
