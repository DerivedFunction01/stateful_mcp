import type { ScratchpadCell } from "@stateful-mcp/clinical";
import { Box, Text, useInput } from "ink";
import { useScratchpadCells } from "../lib/scratchpad/use-scratchpad-cells";
import { t } from "../lib/shared/i18n";

export interface SectionScratchpadProps {
	active: boolean;
	cells: readonly ScratchpadCell[];
	createCellId(): string;
	onCellsChange(cells: readonly ScratchpadCell[]): void;
	onNavigatePreviousTab(): void;
	onExecute(cells: readonly ScratchpadCell[]): Promise<void>;
}

export function SectionScratchpad({
	active,
	cells: initialCells,
	createCellId,
	onCellsChange,
	onNavigatePreviousTab,
	onExecute,
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

	useInput(
		(input, key) => {
			if (key.escape) return;
			if (key.return) {
				const populated = cells.filter((cell) => cell.text.trim().length > 0);
				if (populated.length === 0) return;
				void onExecute(populated).then(clearTexts);
				return;
			}
			if (key.tab && !key.meta && !key.ctrl) {
				if (key.shift) onNavigatePreviousTab();
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
						color={index === activeCellIndex ? "yellow" : "gray"}
					>
						{index === activeCellIndex ? "> " : "  "}
						{t("workspace.sectionScratchpad.cell", { value: index + 1 })}
						{cell.text}
						{index === activeCellIndex ? "█" : ""}
						{" ["}
						{cell.pinnedMacroIds.join(", ") || t("workspace.scratchpad.noPins")}
						{"]"}
					</Text>
				))}
			</Box>
			<Text dimColor>{t("workspace.sectionScratchpad.footer")}</Text>
		</Box>
	);
}
