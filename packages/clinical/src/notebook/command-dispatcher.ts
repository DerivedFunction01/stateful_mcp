import type { Cell, CellMode } from "../session/cell";
import type { CellCommandContext } from "../session/cell-command";
import type { CellCommandRegistry } from "../session/cell-command-registry";
import type { CellProcessResult } from "../session/cell-processor";
import type { CommandDescriptor } from "../session/command-descriptor";
import type { EditorCommandRegistry } from "../session/editor-command-registry";
import type { ExecutionPolicy } from "./notebook-state";

export interface DispatchContext {
	sessionId: string;
	activeCell: Cell | undefined;
	allCells: Cell[];
	editorRegistry: EditorCommandRegistry;
	cellCommandRegistry: CellCommandRegistry;
	processor?: {
		execute(cell: Cell): Promise<CellProcessResult>;
		preview(cell: Cell): Promise<CellProcessResult>;
	};
}

export interface DispatchResult {
	success: boolean;
	message?: string;
	action?:
		| "quit"
		| "save"
		| "show_errors"
		| "show_help"
		| "search"
		| "undo"
		| "redo"
		| "set_execution_mode"
		| "edit_cell";
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

		const cell = this.ctx.activeCell;
		if (!cell)
			return { success: false, message: "no active cell" };

		const ctx: CellCommandContext = {
			sessionId: this.ctx.sessionId,
			cell: structuredClone(cell),
			profile: { cellCommandToken: ":" } as any,
		};

		const result = await handler(
			{ verb: verb as any, args, raw: `${verb} ${args.join(" ")}` },
			ctx,
		);

		if (result.success) {
			return {
				success: true,
				commands: result.cell
					? [
							{
								type: "UPDATE_CELL",
								cellId: cell.cellId,
								updater: () => result.cell,
							},
						]
					: [],
			};
		}

		return {
			success: false,
			message: result.message ?? "cell command failed",
		};
	}

	async dispatch(line: string): Promise<DispatchResult> {
		const verbEnd = line.indexOf(" ");
		const verb = verbEnd >= 0 ? line.slice(0, verbEnd) : line;
		const argsStr = verbEnd >= 0 ? line.slice(verbEnd + 1).trim() : "";
		const args = argsStr ? argsStr.split(" ") : [];

		const editorResult = this.ctx.editorRegistry.dispatch(verb, args);
		if (editorResult.success) {
			return {
				success: true,
				message: editorResult.message,
				action: editorResult.action as any,
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