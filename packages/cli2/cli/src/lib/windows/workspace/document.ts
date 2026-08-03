import type {
	Cell,
	CellCollectionRef,
} from "@stateful-mcp/clinical/session/cell";
import type { WorkspaceCellSummary } from "@stateful-mcp/clinical/session/workspace-read-model";
import type { DocumentAction, DocumentPort, DocumentView } from "../../editor";

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
 * callbacks. The port maintains a local editing projection for generic cell
 * operations while engine-backed insertion remains injectable.
 */
export class WorkspaceDocumentPort implements DocumentPort {
	private currentSelection: { start: number; end: number } | null = null;
	private workingCells: WorkspaceCellSummary[] | null = null;
	private workingActiveIndex: number | null = null;
	private yankBuffer: WorkspaceCellSummary[] = [];
	private undoStack: Array<{
		cells: WorkspaceCellSummary[];
		activeIndex: number;
		selection: { start: number; end: number } | null;
	}> = [];
	private redoStack: Array<{
		cells: WorkspaceCellSummary[];
		activeIndex: number;
		selection: { start: number; end: number } | null;
	}> = [];

	constructor(
		private readonly deps: WorkspaceDocumentDeps,
		private readonly cells: () => WorkspaceCellSummary[],
		private readonly activeIndex: () => number,
		private readonly selection?: () => { start: number; end: number } | null,
	) {}

	private currentCells(): WorkspaceCellSummary[] {
		return this.workingCells ?? this.cells();
	}

	private currentActiveIndex(): number {
		const cells = this.currentCells();
		return Math.max(
			0,
			Math.min(
				this.workingActiveIndex ?? this.activeIndex(),
				Math.max(0, cells.length - 1),
			),
		);
	}

	private ensureWorkingCopy(): WorkspaceCellSummary[] {
		if (!this.workingCells) {
			this.workingCells = structuredClone(this.cells());
			this.workingActiveIndex = this.activeIndex();
		}
		return this.workingCells;
	}

	private saveUndo(): void {
		this.undoStack.push({
			cells: structuredClone(this.currentCells()),
			activeIndex: this.currentActiveIndex(),
			selection: this.currentSelection ? { ...this.currentSelection } : null,
		});
		if (this.undoStack.length > 50) this.undoStack.shift();
		this.redoStack = [];
	}

	private notify(): void {
		this.deps.onChange?.();
	}

	getView(): DocumentView {
		return {
			cells: this.currentCells() as unknown as Cell[],
			activeIndex: this.currentActiveIndex(),
			selection: this.currentSelection ?? this.selection?.() ?? null,
		};
	}

	dispatch(action: DocumentAction): void {
		switch (action.type) {
			case "move": {
				this.workingActiveIndex = Math.max(
					0,
					Math.min(
						this.currentActiveIndex() + action.delta,
						Math.max(0, this.currentCells().length - 1),
					),
				);
				this.notify();
				return;
			}
			case "setActive":
				this.workingActiveIndex = action.index;
				this.notify();
				return;
			case "enterVisual": {
				const index = this.currentActiveIndex();
				this.currentSelection = { start: index, end: index };
				this.notify();
				return;
			}
			case "extendSelection": {
				const selection = this.currentSelection ?? {
					start: this.currentActiveIndex(),
					end: this.currentActiveIndex(),
				};
				const cells = this.currentCells();
				this.currentSelection = {
					...selection,
					end: Math.max(
						0,
						Math.min(cells.length - 1, selection.end + action.delta),
					),
				};
				this.workingActiveIndex = this.currentSelection.end;
				this.notify();
				return;
			}
			case "swapAnchor":
				if (this.currentSelection) {
					this.currentSelection = {
						start: this.currentSelection.end,
						end: this.currentSelection.start,
					};
					this.workingActiveIndex = this.currentSelection.end;
					this.notify();
				}
				return;
			case "insertBelow":
				this.deps.insertBelow?.();
				return;
			case "insertAbove":
				this.deps.insertAbove?.();
				return;
			case "yankActive": {
				const cell = this.currentCells()[this.currentActiveIndex()];
				if (cell) this.yankBuffer = [structuredClone(cell)];
				return;
			}
			case "yankSelection": {
				const selection = this.currentSelection;
				if (!selection) return;
				const lo = Math.min(selection.start, selection.end);
				const hi = Math.max(selection.start, selection.end);
				this.yankBuffer = structuredClone(
					this.currentCells().slice(lo, hi + 1),
				);
				return;
			}
			case "deleteActive": {
				const cells = this.ensureWorkingCopy();
				if (cells.length === 0) return;
				this.saveUndo();
				cells.splice(this.currentActiveIndex(), 1);
				this.workingActiveIndex = Math.min(
					this.currentActiveIndex(),
					Math.max(0, cells.length - 1),
				);
				this.currentSelection = null;
				this.notify();
				return;
			}
			case "deleteSelection": {
				if (!this.currentSelection) return;
				const cells = this.ensureWorkingCopy();
				this.saveUndo();
				const lo = Math.min(
					this.currentSelection.start,
					this.currentSelection.end,
				);
				const hi = Math.max(
					this.currentSelection.start,
					this.currentSelection.end,
				);
				cells.splice(lo, hi - lo + 1);
				this.workingActiveIndex = Math.min(lo, Math.max(0, cells.length - 1));
				this.currentSelection = null;
				this.notify();
				return;
			}
			case "paste": {
				if (this.yankBuffer.length === 0) return;
				const cells = this.ensureWorkingCopy();
				this.saveUndo();
				const insertAt = Math.min(this.currentActiveIndex() + 1, cells.length);
				const pasted = this.yankBuffer.map((cell, index) => ({
					...structuredClone(cell),
					cellId: `${cell.cellId}:paste:${Date.now()}:${index}`,
				}));
				cells.splice(insertAt, 0, ...pasted);
				this.workingActiveIndex = insertAt;
				this.notify();
				return;
			}
			case "undo": {
				const previous = this.undoStack.pop();
				if (!previous) return;
				this.redoStack.push({
					cells: structuredClone(this.currentCells()),
					activeIndex: this.currentActiveIndex(),
					selection: this.currentSelection
						? { ...this.currentSelection }
						: null,
				});
				this.workingCells = previous.cells;
				this.workingActiveIndex = previous.activeIndex;
				this.currentSelection = previous.selection;
				this.notify();
				return;
			}
			case "redo": {
				const next = this.redoStack.pop();
				if (!next) return;
				this.undoStack.push({
					cells: structuredClone(this.currentCells()),
					activeIndex: this.currentActiveIndex(),
					selection: this.currentSelection
						? { ...this.currentSelection }
						: null,
				});
				this.workingCells = next.cells;
				this.workingActiveIndex = next.activeIndex;
				this.currentSelection = next.selection;
				this.notify();
				return;
			}
			default:
				return;
		}
	}

	clearSelection(): void {
		if (!this.currentSelection) return;
		this.currentSelection = null;
		this.notify();
	}
}
