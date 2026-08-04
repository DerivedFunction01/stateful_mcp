import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";

export interface DocumentView {
	cells: StructuredCell[];
	activeIndex: number;
	selection?: { start: number; end: number } | null;
}

export type DocumentAction =
	| { type: "move"; delta: number }
	| { type: "setActive"; index: number }
	| { type: "insertBelow" }
	| { type: "insertAbove" }
	| { type: "deleteActive" }
	| { type: "yankActive" }
	| { type: "paste" }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "enterVisual" }
	| { type: "extendSelection"; delta: number }
	| { type: "swapAnchor" }
	| { type: "deleteSelection" }
	| { type: "yankSelection" }
	| { type: "nextError" }
	| { type: "prevError" };

export interface DocumentPort {
	getView(): DocumentView;
	dispatch(action: DocumentAction): void;
}
