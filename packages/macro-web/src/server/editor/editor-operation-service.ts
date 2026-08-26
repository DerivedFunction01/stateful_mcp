import type { ScratchpadExecutionReceipt } from "@stateful-mcp/macro";
import {
	DocumentManagerError,
	DocumentRevisionError,
} from "@stateful-mcp/macro";
import {
	DOCUMENT_LIFECYCLE_OPERATIONS,
	type DocumentLifecycleOperation,
	type EditorOperation,
	type EditorOperationResult,
	type EditorRejection,
	type ExecutionOperation,
	GROUP_OPERATIONS,
	type GroupOperation,
	type PersistenceOperation,
	PREVIEW_OPERATIONS,
	type PreviewOperation,
	type ResourceOperation,
	structuredError,
	TEXT_OPERATIONS,
	type TemplateOperation,
	type TextOperation,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";
import { isPersistenceOperation } from "./document-persistence-operations";
import { isExecutionOperation } from "./execution-operations";
import { isResourceOperation } from "./resource-operations";
import { isTemplateOperation } from "./template-operations";

export interface EditorOperationRouterContext {
	readonly getSession: (sessionId: string) => Session;
	readonly base: (
		session: Session,
		operation: EditorOperation,
	) => Record<string, unknown>;
	readonly conflict: (
		session: Session,
		operation: EditorOperation,
		documentId: string | undefined,
		expected: number | undefined,
		actual: number | undefined,
	) => EditorOperationResult;
	readonly workspaceConflict: (
		session: Session,
		operation: EditorOperation,
		expected: number,
	) => EditorOperationResult;
	readonly reject: (
		session: Session,
		operation: EditorOperation,
		error: EditorRejection,
	) => EditorOperationResult;
	readonly emit: (
		session: Session,
		type: "workspace.changed" | "command.completed",
	) => void;
	readonly lines: (
		document: import("@stateful-mcp/macro").MacroDocument,
		operation: PreviewOperation,
	) => readonly unknown[];
	readonly executeResource: (
		session: Session,
		operation: ResourceOperation,
		context: {
			readonly base: () => Record<string, unknown>;
			readonly workspaceConflict: (expected: number) => EditorOperationResult;
			readonly reject: (error: EditorRejection) => EditorOperationResult;
			readonly emit: () => void;
			readonly getArtifact: (
				token: string,
			) => { readonly lifecycle?: string; readonly owner?: string } | undefined;
			readonly sessionOwner?: string;
			readonly materializeArtifact?: (
				token: string,
			) => Promise<{ readonly resourceId: string }>;
			readonly isResourceExposed?: (
				kind: string,
				resourceId: string,
			) => boolean;
			readonly openScratchpad: (
				id: string,
				groupId?: string,
			) => Promise<
				| { readonly documentId: string; readonly textRevision: number }
				| undefined
			>;
		},
	) => Promise<EditorOperationResult>;
	readonly executeTemplate: (
		session: Session,
		operation: TemplateOperation,
		context: {
			readonly base: () => Record<string, unknown>;
			readonly reject: (error: EditorRejection) => EditorOperationResult;
			readonly emit: () => void;
			readonly userRoot: string;
		},
	) => Promise<EditorOperationResult>;
	readonly executePersistence: (
		session: Session,
		operation: PersistenceOperation,
		context: {
			readonly base: () => Record<string, unknown>;
			readonly conflict: (
				documentId: string,
				expected: number,
				actual: number,
			) => EditorOperationResult;
			readonly reject: (error: EditorRejection) => EditorOperationResult;
			readonly emit: (fileTree?: boolean) => void;
			readonly projectRoot: () => string;
			readonly resolvePath: (root: string, path: string) => string;
			readonly userRoot: string;
		},
	) => Promise<EditorOperationResult>;
	readonly executeExecution: (
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
				operation: any,
				session: Session,
			) => import("@stateful-mcp/macro-protocol").ScratchpadExecutionReceiptDto;
			readonly identity: (
				receipt: ScratchpadExecutionReceipt,
				operation: any,
				document: any,
			) => ScratchpadExecutionReceipt;
			readonly emit: (type: "command.completed") => void;
		},
	) => Promise<EditorOperationResult>;
	readonly getArtifact: (
		token: string,
	) => { readonly lifecycle?: string; readonly owner?: string } | undefined;
	readonly sessionOwner?: (session: Session) => string;
	readonly isResourceExposed?: (
		session: Session,
		kind: string,
		resourceId: string,
	) => boolean;
	readonly materializeArtifact?: (
		session: Session,
		token: string,
	) => Promise<{ readonly resourceId: string }>;
	readonly openScratchpad: (
		session: Session,
		id: string,
		groupId?: string,
	) => Promise<
		{ readonly documentId: string; readonly textRevision: number } | undefined
	>;
	readonly receipt: (
		receipt: ScratchpadExecutionReceipt,
		operation: any,
		session: Session,
	) => import("@stateful-mcp/macro-protocol").ScratchpadExecutionReceiptDto;
	readonly identity: (
		receipt: ScratchpadExecutionReceipt,
		operation: any,
		document: any,
	) => ScratchpadExecutionReceipt;
	readonly userRoot: (session: Session) => string;
	readonly projectRoot: (session: Session) => string;
	readonly resolvePath: (root: string, path: string) => string;
}

export function isGroupOperation(operation: EditorOperation): boolean {
	return (GROUP_OPERATIONS as readonly string[]).includes(operation.operation);
}

export async function executeGroupOperation(
	session: Session,
	operation: GroupOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly workspaceConflict: (expected: number) => EditorOperationResult;
		readonly emit: () => void;
	},
): Promise<EditorOperationResult> {
	if (
		"expectedWorkspaceRevision" in operation &&
		operation.expectedWorkspaceRevision !== undefined &&
		operation.expectedWorkspaceRevision !== session.revision
	)
		return context.workspaceConflict(operation.expectedWorkspaceRevision);
	const groups = session.loaded.workspace.editorGroups;
	switch (operation.operation) {
		case "editor.createSplitGroup": {
			const group = groups.create(operation);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: group.groupId,
			} as EditorOperationResult;
		}
		case "editor.closeGroup":
			groups.close(operation.groupId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: operation.groupId,
			} as EditorOperationResult;
		case "editor.resizeSplit":
			groups.resizeSplit(operation.nodeId, operation.ratios);
			context.emit();
			return { ...context.base(), status: "accepted" } as EditorOperationResult;
		case "editor.focusGroup":
			groups.focus(operation.groupId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: operation.groupId,
			} as EditorOperationResult;
		case "editor.openDocumentInGroup":
			groups.openDocument(operation.groupId, operation.documentId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: operation.groupId,
				documentId: operation.documentId,
			} as EditorOperationResult;
		case "editor.moveDocumentToGroup":
			groups.moveDocument(operation.documentId, operation.groupId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: operation.groupId,
				documentId: operation.documentId,
			} as EditorOperationResult;
	}
}

export function isTextOperation(
	operation: EditorOperation,
): operation is TextOperation {
	return (TEXT_OPERATIONS as readonly EditorOperation["operation"][]).includes(
		operation.operation,
	);
}

export async function executeTextOperation(
	session: Session,
	operation: TextOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly conflict: (
			documentId: string,
			expected: number,
			actual: number,
		) => EditorOperationResult;
		readonly reject: (error: EditorRejection) => EditorOperationResult;
		readonly emit: () => void;
	},
): Promise<EditorOperationResult> {
	const documents = session.loaded.workspace.documents;
	const document = documents.get(operation.documentId);
	if (!document)
		return context.reject(
			structuredError({
				code: "EDITOR_DOCUMENT_NOT_FOUND",
				messageKey: "editor.document.notFound",
			}),
		);
	if (
		"expectedTextRevision" in operation &&
		operation.expectedTextRevision !== undefined &&
		document.textRevision !== operation.expectedTextRevision
	)
		return context.conflict(
			operation.documentId,
			operation.expectedTextRevision,
			document.textRevision,
		);
	switch (operation.operation) {
		case "editor.setCellDefault":
			documents.setCellDefault(
				operation.documentId,
				operation.lineNumber - 1,
				operation.defaultMacroId,
			);
			break;
		case "editor.replaceText":
			await documents
				.replaceText({
					documentId: operation.documentId,
					lines: operation.lines,
					expectedTextRevision: operation.expectedTextRevision,
				})
				.session.parseAllLines();
			break;
		case "editor.clearExecutedLines":
			documents.clearExecutedLines(operation.documentId);
			break;
		case "editor.resetExecutionState":
			documents.resetExecutionState(operation.documentId);
			break;
	}
	context.emit();
	return {
		...context.base(),
		status: "accepted",
		documentId: operation.documentId,
		textRevision: documents.get(operation.documentId)?.textRevision,
	} as EditorOperationResult;
}

export function isPreviewOperation(
	operation: EditorOperation,
): operation is PreviewOperation {
	return (
		PREVIEW_OPERATIONS as readonly EditorOperation["operation"][]
	).includes(operation.operation);
}

export { isExecutionOperation } from "./execution-operations";

export function isDocumentLifecycleOperation(
	operation: EditorOperation,
): operation is DocumentLifecycleOperation {
	return (
		DOCUMENT_LIFECYCLE_OPERATIONS as readonly EditorOperation["operation"][]
	).includes(operation.operation);
}

export async function executeDocumentLifecycleOperation(
	session: Session,
	operation: DocumentLifecycleOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly conflict: (
			documentId: string,
			expected: number,
			actual: number,
		) => EditorOperationResult;
		readonly reject: (error: EditorRejection) => EditorOperationResult;
		readonly emit: () => void;
	},
): Promise<EditorOperationResult> {
	const workspace = session.loaded.workspace;
	const documents = workspace.documents;
	switch (operation.operation) {
		case "editor.newScratchpad": {
			const document = documents.createBlank();
			const groupId =
				operation.groupId && workspace.editorGroups.get(operation.groupId)
					? operation.groupId
					: workspace.editorGroups.getActiveGroupId();
			if (groupId)
				workspace.editorGroups.moveDocument(document.documentId, groupId);
			documents.select(document.documentId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: document.documentId,
				textRevision: document.textRevision,
			} as EditorOperationResult;
		}
		case "editor.newScratchpadFromTemplate": {
			const document = documents.createFromTemplate(operation.templateId);
			const groupId =
				operation.groupId && workspace.editorGroups.get(operation.groupId)
					? operation.groupId
					: workspace.editorGroups.getActiveGroupId();
			if (groupId)
				workspace.editorGroups.moveDocument(document.documentId, groupId);
			documents.select(document.documentId);
			await document.session.parseAllLines();
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: document.documentId,
			} as EditorOperationResult;
		}
		case "editor.selectDocument":
			documents.select(operation.documentId);
			for (const group of workspace.editorGroups.list())
				if (group.activeDocumentId === operation.documentId)
					workspace.editorGroups.focus(group.groupId);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: operation.documentId,
			} as EditorOperationResult;
		case "editor.closeDocument": {
			const document = documents.get(operation.documentId);
			if (!document)
				return context.reject(
					structuredError({
						code: "EDITOR_DOCUMENT_NOT_FOUND",
						messageKey: "editor.document.notFound",
					}),
				);
			if (
				operation.expectedTextRevision !== undefined &&
				operation.expectedTextRevision !== document.textRevision
			)
				return context.conflict(
					operation.documentId,
					operation.expectedTextRevision,
					document.textRevision,
				);
			documents.close(operation.documentId, operation.force ?? false);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: operation.documentId,
			} as EditorOperationResult;
		}
		case "editor.closeDocumentInGroup": {
			const document = documents.get(operation.documentId);
			if (!document)
				return context.reject(
					structuredError({
						code: "EDITOR_DOCUMENT_NOT_FOUND",
						messageKey: "editor.document.notFound",
					}),
				);
			if (
				operation.expectedTextRevision !== undefined &&
				operation.expectedTextRevision !== document.textRevision
			)
				return context.conflict(
					operation.documentId,
					operation.expectedTextRevision,
					document.textRevision,
				);
			workspace.editorGroups.closeDocumentInGroup(
				operation.groupId,
				operation.documentId,
			);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				groupId: operation.groupId,
				documentId: operation.documentId,
			} as EditorOperationResult;
		}
		case "editor.renameDocument":
			documents.rename(operation.documentId, operation.title);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: operation.documentId,
			} as EditorOperationResult;
		case "editor.duplicateDocument": {
			if (!documents.get(operation.documentId))
				return context.reject(
					structuredError({
						code: "EDITOR_DOCUMENT_NOT_FOUND",
						messageKey: "editor.document.notFound",
					}),
				);
			const duplicated = documents.duplicateDocument(
				operation.documentId,
				operation.title,
			);
			context.emit();
			return {
				...context.base(),
				status: "accepted",
				documentId: duplicated.documentId,
				textRevision: duplicated.textRevision,
			} as EditorOperationResult;
		}
	}
}

export async function executePreviewOperation(
	session: Session,
	operation: PreviewOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly conflict: (
			documentId: string,
			expected: number,
			actual: number,
		) => EditorOperationResult;
		readonly reject: (error: EditorRejection) => EditorOperationResult;
		readonly lines: (
			document: import("@stateful-mcp/macro").MacroDocument,
			operation: PreviewOperation,
		) => readonly unknown[];
	},
): Promise<EditorOperationResult> {
	const document = session.loaded.workspace.documents.get(operation.documentId);
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
	const total = document.session.getTotalLineCount();
	if (
		(operation.operation === "editor.previewLine" &&
			(operation.lineNumber < 1 || operation.lineNumber > total)) ||
		(operation.operation === "editor.previewRange" &&
			(operation.startLine < 1 ||
				operation.endLine < operation.startLine ||
				operation.endLine > total))
	)
		return context.reject(
			structuredError({
				code: "EDITOR_RANGE_INVALID",
				messageKey: "editor.range.invalid",
			}),
		);
	return {
		...context.base(),
		status: "preview",
		documentId: document.documentId,
		textRevision: document.textRevision,
		lines: context.lines(document, operation),
	} as EditorOperationResult;
}

export interface EditorOperationService {
	execute(
		sessionId: string,
		operation: EditorOperation,
	): Promise<EditorOperationResult>;
}

export function createEditorOperationRouter(
	context: EditorOperationRouterContext,
): EditorOperationService {
	return {
		execute: async (sessionId, operation) => {
			const session = context.getSession(sessionId);
			const base = () => context.base(session, operation);
			const conflict = (
				documentId: string | undefined,
				expected: number | undefined,
				actual: number | undefined,
			) => context.conflict(session, operation, documentId, expected, actual);
			const workspaceConflict = (expected: number) =>
				context.workspaceConflict(session, operation, expected);
			const reject = (error: EditorRejection) =>
				context.reject(session, operation, error);
			try {
				if (isGroupOperation(operation))
					return await executeGroupOperation(session, operation as any, {
						base,
						workspaceConflict,
						emit: () => context.emit(session, "workspace.changed"),
					});
				if (isTextOperation(operation))
					return await executeTextOperation(session, operation as any, {
						base,
						conflict: (id, expected, actual) => conflict(id, expected, actual),
						reject,
						emit: () => context.emit(session, "workspace.changed"),
					});
				if (isPreviewOperation(operation))
					return await executePreviewOperation(session, operation as any, {
						base,
						conflict: (id, expected, actual) => conflict(id, expected, actual),
						reject,
						lines: context.lines,
					});
				if (isDocumentLifecycleOperation(operation))
					return await executeDocumentLifecycleOperation(
						session,
						operation as any,
						{
							base,
							conflict: (id, expected, actual) =>
								conflict(id, expected, actual),
							reject,
							emit: () => context.emit(session, "workspace.changed"),
						},
					);
				if (isExecutionOperation(operation))
					return await context.executeExecution(session, operation as any, {
						base,
						conflict: (id, expected, actual) => conflict(id, expected, actual),
						reject,
						receipt: context.receipt,
						identity: context.identity,
						emit: (type) => context.emit(session, type),
					});
				if (isResourceOperation(operation))
					return await context.executeResource(session, operation as any, {
						base,
						workspaceConflict,
						reject,
						emit: () => context.emit(session, "workspace.changed"),
						getArtifact: context.getArtifact,
						sessionOwner: context.sessionOwner?.(session),
						isResourceExposed: context.isResourceExposed
							? (kind, resourceId) =>
									context.isResourceExposed!(session, kind, resourceId)
							: undefined,
						materializeArtifact: context.materializeArtifact
							? (token) => context.materializeArtifact!(session, token)
							: undefined,
						openScratchpad: (id, groupId) =>
							context.openScratchpad(session, id, groupId),
					});
				if (isTemplateOperation(operation))
					return await context.executeTemplate(session, operation as any, {
						base,
						reject,
						emit: () => context.emit(session, "workspace.changed"),
						userRoot: context.userRoot(session),
					});
				if (isPersistenceOperation(operation))
					return await context.executePersistence(session, operation as any, {
						base,
						conflict: (id, expected, actual) => conflict(id, expected, actual),
						reject,
						emit: (fileTree) => context.emit(session, "workspace.changed"),
						projectRoot: () => context.projectRoot(session),
						resolvePath: context.resolvePath,
						userRoot: context.userRoot(session),
					});
				return reject(
					structuredError({
						code: "EDITOR_OPERATION_UNSUPPORTED",
						messageKey: "editor.operation.unsupported",
					}),
				);
			} catch (error) {
				if (error instanceof DocumentRevisionError)
					return conflict(
						"documentId" in operation ? operation.documentId : undefined,
						error.expectedRevision,
						error.actualRevision,
					);
				if (error instanceof DocumentManagerError) {
					return reject(error.toHostError());
				}
				return reject(
					structuredError({
						code: "EDITOR_OPERATION_FAILED",
						messageKey: "editor.operation.failed",
					}),
				);
			}
		},
	};
}

/**
 * Boundary for the editor dispatcher. The manager remains the compatibility
 * facade while operation groups can be moved here incrementally without
 * changing the HTTP/WebSocket protocol.
 */
export function createEditorOperationService(dependencies: {
	readonly getSession: (sessionId: string) => Session;
	readonly execute: (
		sessionId: string,
		operation: EditorOperation,
	) => Promise<EditorOperationResult>;
}): EditorOperationService {
	return {
		execute: dependencies.execute,
	};
}
