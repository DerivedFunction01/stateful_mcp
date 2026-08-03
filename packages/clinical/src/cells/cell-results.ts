/**
 *  cell result references.
 *
 * A cell retains references to durable results (events, document/workspace
 * changes) rather than duplicating the projected document. Read models are
 * derived, not stored on the cell.
 */

export type CellResultKind =
	| "document_change"
	| "workspace_change"
	| "event_batch";

export interface CellResultRef {
	resultId: string;
	resultKind: CellResultKind;
	targetSchema?: string;
	targetPath?: string;
	eventIds?: string[];
	transactionId?: string;
}
