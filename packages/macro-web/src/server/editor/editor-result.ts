import type {
	EditorOperation,
	EditorOperationResult,
	EditorRejection,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

export interface EditorResultSnapshotProvider {
	readonly editorSnapshot: (
		session: Session,
	) => EditorOperationResult["snapshot"];
	readonly workspaceSnapshot: (
		session: Session,
	) => EditorOperationResult["workspaceSnapshot"];
}

/**
 * Builds the canonical rejected editor result from a single structured error.
 * Snapshot construction is injected so the router callback can supply the
 * manager's live snapshot providers; the error contract stays separate from
 * routing context.
 */
export function rejectedEditorResult(
	session: Session,
	operation: EditorOperation,
	error: EditorRejection,
	deps: EditorResultSnapshotProvider,
): EditorOperationResult {
	return {
		operation: operation.operation,
		requestId: operation.requestId,
		status: "rejected",
		code: error.code,
		messageKey: error.messageKey,
		...(error.messageParams ? { messageParams: error.messageParams } : {}),
		snapshot: deps.editorSnapshot(session),
		workspaceSnapshot: deps.workspaceSnapshot(session),
		workspaceRevision: session.revision,
		...("documentId" in operation ? { documentId: operation.documentId } : {}),
	};
}
