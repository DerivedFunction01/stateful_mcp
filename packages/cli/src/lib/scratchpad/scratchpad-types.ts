import type { ScratchpadCell } from "@stateful-mcp/clinical/notebook/notebook-session-store";

export type { ScratchpadCell } from "@stateful-mcp/clinical/notebook/notebook-session-store";

export interface ScratchpadCellAdapterContext {
	cell: ScratchpadCell;
	index: number;
}

export interface ScratchpadCellActions {
	setText(cellId: string, text: string): void;
	setActiveCell(cellId: string): void;
	duplicateCell(cellId: string): void;
	removeCell(cellId: string): void;
	clearTexts(): void;
}
