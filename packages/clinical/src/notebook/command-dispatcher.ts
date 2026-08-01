import type { Cell } from "../session/cell";
import type { CellCommandContext } from "../session/cell-command";
import type { CellCommandRegistry } from "../session/cell-command-registry";
import type { CellProcessResult } from "../session/cell-processor";
import type { EditorCommandRegistry } from "../session/editor-command-registry";

export interface DispatchContext {
	sessionId: string;
	activeCell: Cell | undefined;
	allCells: Cell[];
	editorRegistry: EditorCommandRegistry;
	cellCommandRegistry: CellCommandRegistry;
	selectedIndexes?: number[];
	processor?: {
		execute(cell: Cell): Promise<CellProcessResult>;
		preview(cell: Cell): Promise<CellProcessResult>;
	};
}

export interface DispatchResult {
	success: boolean;
	message?: string;
	action?: string;
	data?: unknown;
	commands?: Array<{ type: string; [key: string]: unknown }>;
}

export class CommandDispatcher {
	constructor(private ctx: DispatchContext) {}

	private async dispatchCellCommand(
		verb: string,
		args: string[],
	): Promise<DispatchResult | null> {
		const handler = this.ctx.cellCommandRegistry.get(verb);
		if (!handler) return null;

		const multiCellVerbs = new Set(["link", "parent", "unlink"]);
		const isMultiCell =
			this.ctx.selectedIndexes &&
			this.ctx.selectedIndexes.length > 0 &&
			multiCellVerbs.has(verb);

		const cellsToProcess = isMultiCell
			? this.ctx
					.selectedIndexes!.map((i) => this.ctx.allCells[i])
					.filter((c): c is Cell => !!c)
			: this.ctx.activeCell
				? [this.ctx.activeCell]
				: [];

		if (cellsToProcess.length === 0)
			return { success: false, message: "no cells to process" };

		const allCommands: Array<{ type: string; [key: string]: unknown }> = [];

		for (const cell of cellsToProcess) {
			if (!cell) continue;
			const ctx: CellCommandContext = {
				sessionId: this.ctx.sessionId,
				cell: structuredClone(cell),
				profile: { cellCommandToken: ":" } as any,
			};

			const result = await handler(
				{ verb: verb as any, args, raw: `${verb} ${args.join(" ")}` },
				ctx,
			);

			if (result.success && result.cell) {
				allCommands.push({
					type: "UPDATE_CELL",
					cellId: cell.cellId,
					updater: () => result.cell,
				});
			} else if (!result.success) {
				return {
					success: false,
					message: result.message ?? `cell command failed for ${cell.cellId}`,
				};
			}
		}

		if (allCommands.length > 0) {
			return { success: true, commands: allCommands };
		}

		return { success: false, message: "no cells updated" };
	}

	async dispatch(line: string): Promise<DispatchResult> {
		const trimmed = line.replace(/^:+/, "").trim();
		if (!trimmed) return { success: false, message: "empty command" };
		const verbEnd = trimmed.indexOf(" ");
		const verb = verbEnd >= 0 ? trimmed.slice(0, verbEnd) : trimmed;
		const argsStr = verbEnd >= 0 ? trimmed.slice(verbEnd + 1).trim() : "";
		const args = argsStr ? argsStr.split(" ") : [];

		const editorResult = this.ctx.editorRegistry.dispatch(verb, args);
		if (editorResult.success) {
			return {
				success: true,
				message: editorResult.message,
				action: editorResult.action as any,
				data: editorResult.data,
				commands: editorResult.data
					? [{ type: "INTERNAL", ...(editorResult.data as any) }]
					: [],
			};
		}

		const cellResult = await this.dispatchCellCommand(verb, args);
		if (cellResult) return cellResult;

		return { success: false, message: `unknown command: ${verb}` };
	}
}
