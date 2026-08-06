import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";

export interface HistoryViewport {
	start: number;
	end: number;
	rows: number;
}

export function historyRowHeight(cell: StructuredCell): number {
	return 1 + cell.diagnostics.filter((item) => item.severity !== "info").length;
}

export function getHistoryViewport(
	cells: readonly StructuredCell[],
	activeIndex: number,
	maxRows: number,
): HistoryViewport {
	if (cells.length === 0 || maxRows <= 0) {
		return { start: 0, end: 0, rows: 0 };
	}

	const active = Math.max(0, Math.min(activeIndex, cells.length - 1));
	let start = active;
	let rows = historyRowHeight(cells[active] as StructuredCell);

	while (start > 0) {
		const previousRows = historyRowHeight(cells[start - 1] as StructuredCell);
		if (rows + previousRows > maxRows) break;
		start -= 1;
		rows += previousRows;
	}

	let end = active + 1;
	while (end < cells.length) {
		const nextRows = historyRowHeight(cells[end] as StructuredCell);
		if (rows + nextRows > maxRows) break;
		end += 1;
		rows += nextRows;
	}

	return { start, end, rows };
}
