import type { CommandResult, EditorContext } from "../../editor";

export interface WindowDomainDeps {
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
	openWorkspace?(): Promise<void>;
	showInfo?(): Promise<void>;
	quit?(): Promise<void>;
}

/**
 * Shared `DomainPort` adapter for a window (notebook or workspace). Maps the
 * generic container domain actions (run/preview/) and window-level commands onto
 * injected, window-specific operations. The container never touches the engine
 * directly.
 */
export class WindowDomainPort {
	constructor(private readonly deps: WindowDomainDeps) {}

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

	async openWorkspace(_context: EditorContext) {
		await this.deps.openWorkspace?.();
	}

	async showInfo(_context: EditorContext) {
		await this.deps.showInfo?.();
	}

	async quit(_context: EditorContext) {
		await this.deps.quit?.();
	}
}

/** Backwards-compatible alias for the notebook domain port. */
export { WindowDomainPort as NotebookDomainPort };
