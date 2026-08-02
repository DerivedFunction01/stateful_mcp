import type {
	NotebookAction,
	NotebookState,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import type { DocumentAction, DocumentPort, DocumentView } from "./cell-editor";

export interface NotebookDocumentDeps {
	/** Insert a new cell below/above the active cell (session-aware). */
	insertBelow(): void;
	insertAbove(): void;
}

/**
 * Adapter that exposes a notebook's `NotebookState`/`NotebookAction` behind the
 * generic `DocumentPort`. The notebook retains its rich reducer; this port only
 * translates a small generic document action set into concrete NotebookActions.
 * Cell insertion is delegated to injected session-aware callbacks (the port
 * never fabricates cells itself).
 */
export class NotebookDocumentPort implements DocumentPort {
	constructor(
		private readonly state: NotebookState,
		private readonly send: (action: NotebookAction) => void,
		private readonly deps?: NotebookDocumentDeps,
	) {}

	getView(): DocumentView {
		const visualMode = this.state.mode === "VISUAL";
		const selection = visualMode
			? { start: this.state.visualStart, end: this.state.visualEnd }
			: null;
		return {
			cells: this.state.cells,
			activeIndex: this.state.activeIndex,
			selection,
		};
	}

	dispatch(action: DocumentAction): void {
		const act = this.toNotebook(action);
		if (act) this.send(act);
	}

	private toNotebook(action: DocumentAction): NotebookAction | null {
		switch (action.type) {
			case "move":
				return { type: "MOVE_CURSOR", delta: action.delta };
			case "setActive":
				return { type: "SET_ACTIVE_INDEX", index: action.index };
			case "insertBelow":
				this.deps?.insertBelow();
				return null;
			case "insertAbove":
				this.deps?.insertAbove();
				return null;
			case "deleteActive":
				return { type: "DELETE_ACTIVE_CELL" };
			case "yankActive":
				return { type: "YANK_CELL" };
			case "paste":
				return { type: "PASTE_CELL" };
			case "undo":
				return { type: "UNDO" };
			case "redo":
				return { type: "REDO" };
			case "enterVisual":
				return { type: "ENTER_VISUAL_MODE" };
			case "extendSelection":
				return { type: "EXTEND_SELECTION", delta: action.delta };
			case "swapAnchor":
				return { type: "SWAP_SELECTION_ANCHOR" };
			case "deleteSelection":
				return { type: "DELETE_SELECTION" };
			case "yankSelection":
				return { type: "YANK_SELECTION" };
		}
	}
}
