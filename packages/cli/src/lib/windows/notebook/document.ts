import type {
	NotebookEditorAction,
	NotebookEditorState,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import type { DocumentAction, DocumentPort, DocumentView } from "../../editor";

export interface NotebookDocumentDeps {
	/** Insert a new cell below/above the active cell (session-aware). */
	insertBelow(): void;
	insertAbove(): void;
	nextError?(): number | null;
	prevError?(): number | null;
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
		private readonly state: NotebookEditorState,
		private readonly send: (action: NotebookEditorAction) => void,
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

	private toNotebook(action: DocumentAction): NotebookEditorAction | null {
		switch (action.type) {
			case "move":
				return { type: "set_active", index: this.state.activeIndex + action.delta };
			case "setActive":
				return { type: "set_active", index: action.index };
			case "insertBelow":
				this.deps?.insertBelow();
				return null;
			case "insertAbove":
				this.deps?.insertAbove();
				return null;
			case "deleteActive":
				return null;
			case "yankActive":
				return null;
			case "paste":
				return null;
			case "undo":
				return null;
			case "redo":
				return null;
			case "enterVisual":
				return { type: "ENTER_VISUAL_MODE" };
			case "extendSelection":
				return {
					type: "set_visual_selection",
					start: this.state.visualStart,
					end: this.state.visualEnd + action.delta,
				};
			case "swapAnchor":
				return {
					type: "set_visual_selection",
					start: this.state.visualEnd,
					end: this.state.visualStart,
				};
			case "deleteSelection":
				return null;
			case "yankSelection":
				return null;
			case "nextError": {
				const index = this.deps?.nextError?.();
				return index === null || index === undefined
					? null
					: { type: "set_active", index };
			}
			case "prevError": {
				const index = this.deps?.prevError?.();
				return index === null || index === undefined
					? null
					: { type: "set_active", index };
			}
		}
	}
}
