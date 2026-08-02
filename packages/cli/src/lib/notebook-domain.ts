import type { CommandResult, EditorContext } from "./cell-editor";

export interface NotebookDomainDeps {
	runActive(): Promise<void>;
	runIndexes(indexes: number[]): Promise<void>;
	runCellIds(cellIds: string[]): Promise<void>;
	previewActive(): Promise<void>;
	dispatchCommand(
		line: string,
		sessionId: string,
		activeIndex: number,
	): Promise<CommandResult>;
	getActiveIndex(): number;
}

/**
 * Adapts the notebook's existing execution (run/preview/command dispatch) behind
 * the generic `DomainPort`. The container routes run/preview and `:` command
 * submission through it; it never touches ClinicalEngine directly.
 */
export class NotebookDomainPort {
	constructor(private readonly deps: NotebookDomainDeps) {}

	async run(
		_context: EditorContext,
		action: { cellIds?: string[]; indexes?: number[] },
	) {
		if (action.indexes && action.indexes.length > 0) {
			await this.deps.runIndexes(action.indexes);
		} else if (action.cellIds && action.cellIds.length > 0) {
			await this.deps.runCellIds(action.cellIds);
		} else {
			await this.deps.runActive();
		}
	}

	async preview(_context: EditorContext) {
		await this.deps.previewActive();
	}

	async dispatchCommand(
		line: string,
		context: EditorContext,
	): Promise<CommandResult> {
		return this.deps.dispatchCommand(
			line,
			context.sessionId,
			this.deps.getActiveIndex(),
		);
	}
}
