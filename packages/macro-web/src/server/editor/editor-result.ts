import type {
	EditorOperation,
	EditorOperationResult,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

export function rejectedEditorResult(
	session: Session,
	operation: EditorOperation,
	code: string,
	message: string,
	options: {
		readonly editorSnapshot: () => unknown;
		readonly workspaceSnapshot: () => unknown;
		readonly message: (code: string, fallback: string) => string;
	},
): EditorOperationResult {
	return {
		operation: operation.operation,
		requestId: operation.requestId,
		status: "rejected",
		code,
		message: options.message(code, message),
		snapshot: options.editorSnapshot() as EditorOperationResult["snapshot"],
		workspaceSnapshot:
			options.workspaceSnapshot() as EditorOperationResult["workspaceSnapshot"],
		workspaceRevision: session.revision,
		...("documentId" in operation ? { documentId: operation.documentId } : {}),
	};
}
