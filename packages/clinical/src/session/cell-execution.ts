import type { SoapNote } from "../schemas/document";

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
}
