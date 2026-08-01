import type { SoapNote } from "../schemas/document";

/** Narrow document operations required by the shared cell lifecycle. */
export interface CellDocumentExecutor {
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
