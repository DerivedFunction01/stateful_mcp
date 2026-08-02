import type {
	Cell,
	CellCollectionRef,
} from "@stateful-mcp/clinical/session/cell";
import type { WorkspaceCellSummary } from "@stateful-mcp/clinical/session/workspace-read-model";
import type { DocumentAction, DocumentPort, DocumentView } from "./cell-editor";

export interface WorkspaceDocumentDeps {
	/** The workspace's cell collection; used by insertion intents. */
	collection: CellCollectionRef;
	/** Injectable session-aware insertion hooks (mirrors the notebook port). */
	insertBelow?(): void;
	insertAbove?(): void;
	onChange?(): void;
}

/**
 * Adapter that exposes a workspace's cell collection behind the generic
 * `DocumentPort`. Reads from an immutable `WorkspaceCellSummary[]` snapshot and
 * translates the generic document action set into injected session-aware
 * callbacks. Unsupported durable mutations (undo/redo/paste, etc.) are no-ops
 * until those workspace cell operations are wired.
 */
export class WorkspaceDocumentPort implements DocumentPort {
	private currentSelection: { start: number; end: number } | null = null;

	constructor(
		private readonly deps: WorkspaceDocumentDeps,
		private readonly cells: () => WorkspaceCellSummary[],
		private readonly activeIndex: () => number,
		private readonly selection?: () => { start: number; end: number } | null,
	) {}

	getView(): DocumentView {
		return {
			cells: this.cells() as unknown as Cell[],
			activeIndex: this.activeIndex(),
			selection: this.currentSelection ?? this.selection?.() ?? null,
		};
	}

	dispatch(action: DocumentAction): void {
		// Workspace cell mutations flow through submitPlan/engine ops, which the
		// container routes via domain commands. Cell insertion is delegated to the
		// injected session-aware callbacks when present.
		switch (action.type) {
			case "enterVisual": {
				const index = this.activeIndex();
				this.currentSelection = { start: index, end: index };
				this.deps.onChange?.();
				return;
			}
			case "extendSelection": {
				const selection = this.currentSelection ?? {
					start: this.activeIndex(),
					end: this.activeIndex(),
				};
				this.currentSelection = {
					...selection,
					end: Math.max(
						0,
						Math.min(this.cells().length - 1, selection.end + action.delta),
					),
				};
				this.deps.onChange?.();
				return;
			}
			case "insertBelow":
				this.deps.insertBelow?.();
				return;
			case "insertAbove":
				this.deps.insertAbove?.();
				return;
			default:
				return;
		}
	}

	clearSelection(): void {
		if (!this.currentSelection) return;
		this.currentSelection = null;
		this.deps.onChange?.();
	}
}
