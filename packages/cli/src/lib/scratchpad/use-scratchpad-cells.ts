import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	clearScratchpadCellTexts,
	duplicateScratchpadCell,
	moveScratchpadCellIndex,
} from "./scratchpad-cell-state";
import type { ScratchpadCell } from "./scratchpad-types";

export interface ScratchpadCellState {
	cells: ScratchpadCell[];
	activeCellIndex: number;
}

export interface ScratchpadCellController extends ScratchpadCellState {
	activeCell?: ScratchpadCell;
	setCells(cells: ScratchpadCell[]): void;
	setActiveCellIndex(index: number): void;
	setActiveCellText(text: string): void;
	duplicateActiveCell(newCellId: string): void;
	moveActiveCell(delta: -1 | 1): void;
	movePreviousCell(): void;
	clearTexts(): void;
}

export function useScratchpadCells(
	initialCells: readonly ScratchpadCell[],
	onCellsChange?: (cells: readonly ScratchpadCell[]) => void,
): ScratchpadCellController {
	const [cells, setCells] = useState<ScratchpadCell[]>(() => [...initialCells]);
	const [activeCellIndex, setActiveCellIndex] = useState(0);
	const incomingCells = JSON.stringify(initialCells);
	const lastIncomingCells = useRef(incomingCells);

	useEffect(() => {
		if (incomingCells === lastIncomingCells.current) return;
		lastIncomingCells.current = incomingCells;
		setCells([...initialCells]);
		setActiveCellIndex(0);
	}, [incomingCells, initialCells]);
	const updateCells = useCallback(
		(updater: (current: ScratchpadCell[]) => ScratchpadCell[]) => {
			setCells((current) => {
				const next = updater(current);
				lastIncomingCells.current = JSON.stringify(next);
				onCellsChange?.(next);
				return next;
			});
		},
		[onCellsChange],
	);

	const activeCell = cells[activeCellIndex];
	const setActiveCellText = useCallback(
		(text: string) => {
			updateCells((current) =>
				current.map((cell, index) =>
					index === activeCellIndex ? { ...cell, text } : cell,
				),
			);
		},
		[activeCellIndex, updateCells],
	);

	const duplicateActiveCell = useCallback(
		(newCellId: string) => {
			if (!activeCell) return;
			updateCells((current) =>
				duplicateScratchpadCell(current, activeCell.cellId, newCellId),
			);
			setActiveCellIndex((index) => index + 1);
		},
		[activeCell, updateCells],
	);

	const moveActiveCell = useCallback(
		(delta: -1 | 1) => {
			setActiveCellIndex((index) =>
				moveScratchpadCellIndex(cells, index, delta),
			);
		},
		[cells],
	);

	const movePreviousCell = useCallback(() => {
		moveActiveCell(-1);
	}, [moveActiveCell]);

	const clearTexts = useCallback(() => {
		updateCells((current) => clearScratchpadCellTexts(current));
	}, [updateCells]);

	return useMemo(
		() => ({
			cells,
			activeCellIndex,
			activeCell,
			setCells,
			setActiveCellIndex,
			setActiveCellText,
			duplicateActiveCell,
			moveActiveCell,
			movePreviousCell,
			clearTexts,
		}),
		[
			cells,
			activeCellIndex,
			activeCell,
			setActiveCellText,
			duplicateActiveCell,
			moveActiveCell,
			movePreviousCell,
			clearTexts,
		],
	);
}
