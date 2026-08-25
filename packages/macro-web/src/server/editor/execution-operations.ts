import type {
	ScratchpadExecutionBatchResult,
	ScratchpadExecutionReceipt,
} from "@stateful-mcp/macro";
import {
	type EditorOperation,
	type EditorOperationResult,
	type EditorRejection,
	type ScratchpadExecutionReceiptDto,
	structuredError,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

type ExecutionOperation = Extract<
	EditorOperation,
	{
		operation:
			| "editor.executeLine"
			| "editor.executeRange"
			| "editor.executeValidLines";
	}
>;

export function toExecutionReceiptDto(
	receipt: ScratchpadExecutionReceipt,
	operation: ExecutionOperation,
	session: Session,
	context: {
		readonly payload: (
			value: unknown,
			ownerId: string,
		) => import("@stateful-mcp/macro-protocol").EditorPayloadEnvelope;
		readonly message: (session: Session, key: string) => string;
	},
): ScratchpadExecutionReceiptDto {
	return {
		documentId: operation.documentId,
		requestId: operation.requestId,
		textRevision: operation.expectedTextRevision,
		lineNumber: receipt.lineNumber,
		rawText: receipt.rawText,
		macroId: receipt.macroId,
		...(receipt.invokedAs ? { invokedAs: receipt.invokedAs } : {}),
		success: receipt.success,
		...(receipt.result === undefined
			? {}
			: { result: context.payload(receipt.result, receipt.macroId) }),
		...(receipt.error
			? {
					error: context.message(session, "editor.execution.failed"),
					errorCode: "EDITOR_EXECUTION_FAILED",
				}
			: {}),
		executedAt: receipt.executedAt,
	};
}

export function isExecutionOperation(
	operation: EditorOperation,
): operation is ExecutionOperation {
	return (
		operation.operation === "editor.executeLine" ||
		operation.operation === "editor.executeRange" ||
		operation.operation === "editor.executeValidLines"
	);
}

export function withExecutionIdentity(
	receipt: ScratchpadExecutionReceipt,
	operation: ExecutionOperation,
	document: NonNullable<
		ReturnType<Session["loaded"]["workspace"]["documents"]["get"]>
	>,
): ScratchpadExecutionReceipt {
	return {
		...receipt,
		identity: {
			documentId: document.documentId,
			requestId: operation.requestId,
			operation: operation.operation,
			textRevision: document.textRevision,
		},
	};
}

export async function executeExecutionOperation(
	session: Session,
	operation: ExecutionOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly conflict: (
			documentId: string,
			expected: number,
			actual: number,
		) => EditorOperationResult;
		readonly reject: (error: EditorRejection) => EditorOperationResult;
		readonly receipt: (
			receipt: ScratchpadExecutionReceipt,
			operation: ExecutionOperation,
			session: Session,
		) => import("@stateful-mcp/macro-protocol").ScratchpadExecutionReceiptDto;
		readonly identity: (
			receipt: ScratchpadExecutionReceipt,
			operation: ExecutionOperation,
			document: NonNullable<
				ReturnType<Session["loaded"]["workspace"]["documents"]["get"]>
			>,
		) => ScratchpadExecutionReceipt;
		readonly emit: (type: "command.completed") => void;
	},
): Promise<EditorOperationResult> {
	const workspace = session.loaded.workspace;
	const document = workspace.documents.get(operation.documentId);
	if (!document)
		return context.reject(
			structuredError({
				code: "EDITOR_DOCUMENT_NOT_FOUND",
				messageKey: "editor.document.notFound",
			}),
		);
	if (document.textRevision !== operation.expectedTextRevision)
		return context.conflict(
			operation.documentId,
			operation.expectedTextRevision,
			document.textRevision,
		);
	await document.session.parseAllLines();
	if (operation.operation === "editor.executeLine") {
		if (
			document.session.getLineStatusByNumber(operation.lineNumber) !== "valid"
		)
			return context.reject(
				structuredError({
					code: "EDITOR_LINE_NOT_EXECUTABLE",
					messageKey: "editor.line.notExecutable",
				}),
			);
		const receipt =
			await workspace.commands.executeCommand<ScratchpadExecutionReceipt | null>(
				"editor.executeLine",
				operation,
			);
		if (!receipt)
			return context.reject(
				structuredError({
					code: "EDITOR_LINE_NOT_EXECUTABLE",
					messageKey: "editor.execution.failed",
				}),
			);
		await workspace.journal.recordExecution(
			context.identity(receipt, operation, document),
		);
		context.emit("command.completed");
		return {
			...context.base(),
			status: "accepted",
			documentId: document.documentId,
			textRevision: document.textRevision,
			receipts: [context.receipt(receipt, operation, session)],
		} as unknown as EditorOperationResult;
	}
	const command =
		operation.operation === "editor.executeRange"
			? "editor.executeRange"
			: "editor.executeValidLines";
	try {
		const result =
			await workspace.commands.executeCommand<ScratchpadExecutionBatchResult>(
				command,
				operation,
			);
		for (const receipt of result.receipts)
			await workspace.journal.recordExecution(
				context.identity(receipt, operation, document),
			);
		context.emit("command.completed");
		return {
			...context.base(),
			status: "accepted",
			documentId: document.documentId,
			textRevision: document.textRevision,
			receipts: result.receipts.map((receipt) =>
				context.receipt(receipt, operation, session),
			),
			skippedLines: result.skippedLines,
		} as unknown as EditorOperationResult;
	} catch (error) {
		return context.reject(
			structuredError({
				code: (error as { code?: string }).code ?? "EDITOR_RANGE_INVALID",
				messageKey:
					(error as { code?: string }).code === "EDITOR_LINE_NOT_EXECUTABLE"
						? "editor.line.notExecutable"
						: "editor.range.invalid",
			}),
		);
	}
}
