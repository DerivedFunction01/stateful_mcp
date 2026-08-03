import type { StructuredCell } from "../cells/structured-cell";
import type {
	V2CellCompileContext,
	V2CellCompiler,
} from "../cells/v2-cell-compiler";
import type { MacroExecutionPlan } from "../macros/macro-plan";

export interface V2CellPreview {
	cellId: string;
	rawText: string;
	plan?: MacroExecutionPlan;
	fingerprint: string;
	diagnostics: readonly string[];
}

/** Native V2 replacement for the V1 PreviewWorkflow/PreviewCandidate pair. */
export class V2NotebookPreviewWorkflow {
	constructor(private readonly compiler: V2CellCompiler) {}

	async preview(
		cell: StructuredCell,
		context?: V2CellCompileContext,
	): Promise<V2CellPreview> {
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
