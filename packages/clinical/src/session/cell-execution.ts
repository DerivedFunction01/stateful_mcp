import type { SoapNote } from "../schemas/document";
import type { CommandMacroLinkOperation } from "../parser/command/command-macro-ir";
import type { CommandMacroGraphPlan } from "../parser/command/command-macro-ir";

export interface CellDocumentExecutionResult {
	soapNote: SoapNote;
	parseResult: import("../parser/cdsl-parser").ClinicalParseResult;
}

/** Narrow document operations required by the shared cell lifecycle. */
export interface CellDocumentExecutor {
	processCdslDetailed(
		sessionId: string,
		text: string,
		alias?: string,
	): Promise<CellDocumentExecutionResult>;
	processCdsl(
		sessionId: string,
		text: string,
		alias?: string,
	): Promise<SoapNote>;
	setSoapNoteField(
		sessionId: string,
		fieldPath: string,
		value: unknown,
		alias?: string,
	): Promise<SoapNote>;
	/** Optional graph-link primitive. Macro cells reject links when unavailable. */
	applyMacroLink?(sessionId: string, link: CommandMacroLinkOperation): Promise<void>;
	/** Atomic graph application when the backing document store supports it. */
	applyMacroGraph?(sessionId: string, graph: CommandMacroGraphPlan, alias?: string): Promise<{ generatedCellIds?: string[] }>;
}
