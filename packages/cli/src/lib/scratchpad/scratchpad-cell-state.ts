import type { ScratchpadCell } from "./scratchpad-types";

export function duplicateScratchpadCell(
	cells: readonly ScratchpadCell[],
	cellId: string,
	newCellId: string,
): ScratchpadCell[] {
	const index = cells.findIndex((cell) => cell.cellId === cellId);
	if (index < 0) return [...cells];
	const source = cells[index];
	if (!source) return [...cells];
	const duplicate: ScratchpadCell = {
		cellId: newCellId,
		text: "",
		pinnedMacroIds: [...source.pinnedMacroIds],
		explicitPins: source.explicitPins,
	};
	return [...cells.slice(0, index + 1), duplicate, ...cells.slice(index + 1)];
}

export function clearScratchpadCellTexts(
	cells: readonly ScratchpadCell[],
): ScratchpadCell[] {
	return cells.map((cell) => ({ ...cell, text: "" }));
}

export function moveScratchpadCellIndex(
	cells: readonly ScratchpadCell[],
	activeIndex: number,
	delta: -1 | 1,
): number {
	if (cells.length === 0) return activeIndex;
	return Math.max(0, Math.min(cells.length - 1, activeIndex + delta));
}

export function populatedScratchpadCells(
	cells: readonly ScratchpadCell[],
): ScratchpadCell[] {
	return cells.filter((cell) => cell.text.trim().length > 0);
}
