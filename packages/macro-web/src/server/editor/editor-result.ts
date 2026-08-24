import type {
	EditorOperation,
	EditorOperationResult,
	MessageParam,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

export function rejectedEditorResult(
	session: Session,
	operation: EditorOperation,
	code: string,
	options: {
		readonly editorSnapshot: () => unknown;
		readonly workspaceSnapshot: () => unknown;
		readonly messageKey: (code: string) => string;
		readonly messageParams?: (
			code: string,
		) => Readonly<Record<string, MessageParam>> | undefined;
	},
): EditorOperationResult {
	const messageParams = options.messageParams?.(code);
	return {
		operation: operation.operation,
		requestId: operation.requestId,
		status: "rejected",
		code,
		messageKey: options.messageKey(code),
		...(messageParams ? { messageParams } : {}),
		snapshot: options.editorSnapshot() as EditorOperationResult["snapshot"],
		workspaceSnapshot:
			options.workspaceSnapshot() as EditorOperationResult["workspaceSnapshot"],
		workspaceRevision: session.revision,
		...("documentId" in operation ? { documentId: operation.documentId } : {}),
	};
}
