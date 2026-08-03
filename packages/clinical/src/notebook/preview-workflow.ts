import type { StructuredCell } from "../cells/structured-cell";
import type {
	CellCompileContext,
	CellCompiler,
} from "../cells/v2-cell-compiler";
import type { MacroExecutionPlan } from "../macros/macro-plan";

export interface CellPreview {
	cellId: string;
	rawText: string;
	plan?: MacroExecutionPlan;
	fingerprint: string;
	diagnostics: readonly string[];
}

/** Native  replacement for the V1 PreviewWorkflow/PreviewCandidate pair. */
export class NotebookPreviewWorkflow {
	constructor(private readonly compiler: CellCompiler) {}

	async preview(
		cell: StructuredCell,
		context?: CellCompileContext,
	): Promise<CellPreview> {
		const result = await this.compiler.compile(cell.authored.rawText, context);
		return {
			cellId: cell.cellId,
			rawText: cell.authored.rawText,
			plan: result.plan,
			fingerprint: result.fingerprint,
			diagnostics: result.diagnostics,
		};
	}
}
