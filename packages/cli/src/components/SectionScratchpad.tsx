import type { ScratchpadCell } from "@stateful-mcp/clinical";
import type { NotebookEditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useScratchpadCells } from "../lib/scratchpad/use-scratchpad-cells";
import { t } from "../lib/shared/i18n";

export interface SectionScratchpadProps {
	active: boolean;
	cells: readonly ScratchpadCell[];
	createCellId(): string;
	onCellsChange(cells: readonly ScratchpadCell[]): void;
	onExecute(cells: readonly ScratchpadCell[]): Promise<void>;
	mode?: NotebookEditorMode;
	onModeChange?(mode: NotebookEditorMode): void;
}

export function SectionScratchpad({
	active,
	cells: initialCells,
	createCellId,
	onCellsChange,
	onExecute,
	mode = "INSERT",
	onModeChange,
}: SectionScratchpadProps) {
	const state = useScratchpadCells(initialCells, onCellsChange);
	const {
		cells,
		activeCell,
		activeCellIndex,
		setActiveCellText,
		duplicateActiveCell,
		moveActiveCell,
		movePreviousCell,
		clearTexts,
	} = state;
	const [visualRange, setVisualRange] = useState({
		start: activeCellIndex,
		end: activeCellIndex,
	});

	useInput(
		(input, key) => {
			if (mode === "NORMAL") {
				if (input === "i" && !key.ctrl && !key.meta) {
					onModeChange?.("INSERT");
					return;
				}
				if (key.return) {
					onModeChange?.("INSERT");
					return;
				}
				if (input === "v" && !key.ctrl && !key.meta) {
					setVisualRange({ start: activeCellIndex, end: activeCellIndex });
					onModeChange?.("VISUAL");
					return;
				}
				if (key.upArrow || key.downArrow) {
					moveActiveCell(key.upArrow ? -1 : 1);
					return;
				}
				return;
			}
			if (mode === "VISUAL") {
				if (key.escape) {
					onModeChange?.("NORMAL");
					return;
				}
				if (key.upArrow || key.downArrow) {
					const delta = key.upArrow ? -1 : 1;
					setVisualRange((range) => ({
						...range,
						end: Math.max(0, Math.min(cells.length - 1, range.end + delta)),
					}));
					return;
				}
				if (key.return) {
					const start = Math.min(visualRange.start, visualRange.end);
					const end = Math.max(visualRange.start, visualRange.end);
					const selected = cells
						.slice(start, end + 1)
						.filter((cell) => cell.text.trim().length > 0);
					if (selected.length === 0) return;
					void onExecute(selected)
						.then(() => {
							clearTexts();
							onModeChange?.("NORMAL");
						})
						.catch(() => undefined);
					return;
				}
				return;
			}
			if (key.escape) {
				onModeChange?.("NORMAL");
				return;
			}
			if (key.return) {
				const populated = cells.filter((cell) => cell.text.trim().length > 0);
				if (populated.length === 0) return;
				void onExecute(populated)
					.then(clearTexts)
					.catch(() => undefined);
				return;
			}
			if (key.tab && !key.meta && !key.ctrl) {
				if (key.shift) return;
				else duplicateActiveCell(createCellId());
				return;
			}
			if (key.upArrow) {
				moveActiveCell(-1);
				return;
			}
			if (key.downArrow) {
				moveActiveCell(1);
				return;
			}
			if (key.backspace || key.delete) {
				setActiveCellText((activeCell?.text ?? "").slice(0, -1));
				return;
			}
			if (input.length === 1 && !key.ctrl && !key.meta) {
				setActiveCellText((activeCell?.text ?? "") + input);
			}
		},
		{ isActive: active },
	);

	if (!active) return null;

	return (
		<Box flexDirection="column" padding={1} width="100%">
			<Text bold color="cyan">
				{t("workspace.sectionScratchpad.title")}
			</Text>
			<Text dimColor>{t("workspace.sectionScratchpad.hint")}</Text>
			<Box flexDirection="column" marginTop={1}>
				{cells.map((cell, index) => (
					<Text
						key={cell.cellId}
						color={
							mode === "VISUAL" &&
							index >= Math.min(visualRange.start, visualRange.end) &&
							index <= Math.max(visualRange.start, visualRange.end)
								? "cyan"
								: index === activeCellIndex
									? "yellow"
									: "gray"
						}
					>
						{t("workspace.scratchpad.line", { value: index + 1 })}
						{cell.text}
						{index === activeCellIndex ? "█" : ""}
						{" "}
						<Text dimColor>
							[
							{cell.pinnedMacroIds.join(", ") ||
								t("workspace.scratchpad.noPins")}
							]
						</Text>
					</Text>
				))}
			</Box>
			<Text dimColor>{t("workspace.sectionScratchpad.footer")}</Text>
		</Box>
	);
}
