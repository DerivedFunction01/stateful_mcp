export const WIDE_LAYOUT_BREAKPOINT = 110;
export const HISTORY_PANE_WIDTH = 28;
export const DETAILS_PANE_MAX_WIDTH = 44;
export const MACRO_EDITOR_ROWS = 3;
export const STATUS_ROWS = 1;
export const FOOTER_ROWS = 1;
export const RESERVED_BOTTOM_ROWS =
	MACRO_EDITOR_ROWS + STATUS_ROWS + FOOTER_ROWS;

export interface WindowLayoutInput {
	columns: number;
	rows: number;
	sidebarOpen: boolean;
}

export interface WindowLayout {
	columns: number;
	rows: number;
	wide: boolean;
	sidebarOpen: boolean;
	historyWidth: number;
	detailsWidth: number;
	centerWidth: number;
	workspaceRows: number;
	historyRows: number;
	detailsRows: number;
	bottomRows: number;
}

export function deriveWindowLayout(input: WindowLayoutInput): WindowLayout {
	const columns = Math.max(1, input.columns);
	const rows = Math.max(1, input.rows);
	const wide = columns >= WIDE_LAYOUT_BREAKPOINT;
	const sidebarOpen = input.sidebarOpen;
	const historyWidth = wide
		? Math.min(HISTORY_PANE_WIDTH, Math.max(1, columns - 1))
		: columns;
	const detailsWidth =
		wide && sidebarOpen
			? Math.min(
					DETAILS_PANE_MAX_WIDTH,
					Math.max(1, columns - historyWidth - 1),
				)
			: 0;
	const centerWidth = Math.max(1, columns - historyWidth - detailsWidth);
	const bottomRows = Math.min(RESERVED_BOTTOM_ROWS, rows);
	const workspaceRows = Math.max(1, rows - bottomRows);

	return {
		columns,
		rows,
		wide,
		sidebarOpen,
		historyWidth,
		detailsWidth,
		centerWidth,
		workspaceRows,
		historyRows: workspaceRows,
		detailsRows: rows,
		bottomRows,
	};
}
