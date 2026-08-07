import type { MacroDefinition, ScratchpadCell } from "@stateful-mcp/clinical";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t } from "../lib/shared/i18n";

type EditorFocus = "cells" | "macros";

export interface ScratchpadEditorProps {
	active: boolean;
	cells: readonly ScratchpadCell[];
	macros: readonly MacroDefinition[];
	onCellsChange(cells: readonly ScratchpadCell[]): void;
}

export function ScratchpadEditor({
	active,
	cells,
	macros,
	onCellsChange,
}: ScratchpadEditorProps) {
	const [focus, setFocus] = useState<EditorFocus>("cells");
	const [cellIndex, setCellIndex] = useState(0);
	const [macroIndex, setMacroIndex] = useState(0);
	const activeCell = cells[cellIndex];

	useInput(
		(input, key) => {
			if (key.escape) return;
			if (key.tab && !key.meta && !key.ctrl) {
				if (key.shift) {
					return;
				}
				setFocus((current) => (current === "cells" ? "macros" : "cells"));
				return;
			}
			if (focus === "cells") {
				if (key.upArrow || input === "k") {
					setCellIndex((value) => Math.max(0, value - 1));
					return;
				}
				if (key.downArrow || input === "j") {
					setCellIndex((value) =>
						Math.min(Math.max(0, cells.length - 1), value + 1),
					);
					return;
				}
				if (key.return) setFocus("macros");
				return;
			}

			if (key.upArrow || input === "k") {
				setMacroIndex((value) => Math.max(0, value - 1));
				return;
			}
			if (key.downArrow || input === "j") {
				setMacroIndex((value) =>
					Math.min(Math.max(0, macros.length - 1), value + 1),
				);
				return;
			}
			if (!key.return || !activeCell) return;
			const macro = macros[macroIndex];
			if (!macro) return;
			const pinned = activeCell.pinnedMacroIds.includes(macro.macroId);
			onCellsChange(
				cells.map((cell, index) =>
					index === cellIndex
						? {
								...cell,
								pinnedMacroIds: pinned
									? cell.pinnedMacroIds.filter((id) => id !== macro.macroId)
									: [...cell.pinnedMacroIds, macro.macroId],
								explicitPins: true,
							}
						: cell,
				),
			);
		},
		{ isActive: active },
	);

	if (!active) return null;

	return (
		<Box flexDirection="column" padding={1} width="100%">
			<Text bold color="cyan">
				{t("workspace.scratchpad.editorTitle")}
			</Text>
			<Text dimColor>{t("workspace.scratchpad.editorHint")}</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={focus === "cells" ? "yellow" : "gray"}>
					{t("workspace.scratchpad.editorCells")}
				</Text>
				{cells.map((cell, index) => (
					<Text
						key={cell.cellId}
						inverse={focus === "cells" && index === cellIndex}
					>
						{focus === "cells" && index === cellIndex ? "> " : "  "}
						{index + 1}. {cell.text || t("workspace.scratchpad.emptyCell")} [
						{cell.pinnedMacroIds.join(", ") || t("workspace.scratchpad.noPins")}
						]
					</Text>
				))}
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold color={focus === "macros" ? "yellow" : "gray"}>
					{t("workspace.scratchpad.editorMacros")}
				</Text>
				{macros.map((macro, index) => (
					<Text
						key={macro.macroId}
						inverse={focus === "macros" && index === macroIndex}
					>
						{focus === "macros" && index === macroIndex ? "> " : "  "}
						{macro.macroName}
						{macro.description ? ` - ${macro.description}` : ""}
					</Text>
				))}
			</Box>
		</Box>
	);
}
