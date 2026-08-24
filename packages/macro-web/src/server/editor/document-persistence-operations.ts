import { readFile, stat, writeFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import type {
	EditorOperation,
	EditorOperationResult,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "../host-session/session-types";

type PersistenceOperation = Extract<
	EditorOperation,
	{ operation: "editor.openFile" | "editor.save" | "editor.saveScratchpad" }
>;
export function isPersistenceOperation(
	operation: EditorOperation,
): operation is PersistenceOperation {
	return ["editor.openFile", "editor.save", "editor.saveScratchpad"].includes(
		operation.operation,
	);
}

export async function executePersistenceOperation(
	session: Session,
	operation: PersistenceOperation,
	context: {
		readonly base: () => Record<string, unknown>;
		readonly conflict: (
			documentId: string,
			expected: number,
			actual: number,
		) => EditorOperationResult;
		readonly reject: (code: string, message: string) => EditorOperationResult;
		readonly emit: (fileTree?: boolean) => void;
		readonly projectRoot: () => string;
		readonly resolvePath: (root: string, path: string) => string;
		readonly userRoot: string;
	},
): Promise<EditorOperationResult> {
	const workspace = session.loaded.workspace;
	const documents = workspace.documents;
	if (operation.operation === "editor.openFile") {
		const root = context.projectRoot();
		const path = context.resolvePath(root, operation.path);
		const metadata = await stat(path);
		if (metadata.isDirectory()) throw new Error("Cannot open a directory");
		if (metadata.size > 2 * 1024 * 1024)
			throw new Error("File is too large to edit as text");
		const bytes = await readFile(path);
		if (bytes.includes(0))
			throw new Error("Binary files cannot be opened in the text editor");
		const document = documents.openFile(path, bytes.toString("utf8"));
		documents.markSaved(document.documentId, metadata.mtimeMs);
		const group = workspace.editorGroups.get(
			operation.groupId ?? workspace.editorGroups.getActiveGroupId(),
		);
		if (group)
			workspace.editorGroups.openDocument(group.groupId, document.documentId);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
			documentId: document.documentId,
			textRevision: document.textRevision,
		} as unknown as EditorOperationResult;
	}
	const document = documents.get(operation.documentId);
	if (!document)
		return context.reject("EDITOR_DOCUMENT_NOT_FOUND", "Document not found");
	if (
		operation.expectedTextRevision !== undefined &&
		operation.expectedTextRevision !== document.textRevision
	)
		return context.conflict(
			document.documentId,
			operation.expectedTextRevision,
			document.textRevision,
		);
	if (operation.operation === "editor.saveScratchpad") {
		const project = session.loaded.project;
		const scratchpadId =
			operation.scratchpadId ??
			(document.documentId.startsWith("scratchpad-")
				? document.documentId
				: `scratchpad-${document.documentId}`);
		const lines = document.editor.getLines().map((rawText, index) => ({
			lineNumber: index + 1,
			rawText,
			...(document.cellDefaults.get(index)
				? { defaultMacroId: document.cellDefaults.get(index) }
				: {}),
		}));
		if (project)
			await project.saveScratchpad({
				scratchpadId,
				formatVersion: 1,
				title: operation.title ?? document.title,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				textRevision: document.textRevision,
				rawText: document.editor.getLines().join("\n"),
				lines,
				executedLineIndices: [...document.session.getExecutedLineIndices()],
				metadata: {},
			});
		documents.markSaved(document.documentId);
		context.emit();
		return {
			...context.base(),
			status: "accepted",
			documentId: document.documentId,
			textRevision: document.textRevision,
		} as unknown as EditorOperationResult;
	}
	if (document.providerId !== "file" || !document.filePath)
		return context.reject(
			"FILE_NOT_EDITABLE_AS_TEXT",
			"Document is not file-backed",
		);
	const root = context.projectRoot();
	const path = context.resolvePath(
		root,
		relative(root, document.filePath).split(sep).join("/"),
	);
	const current = await stat(path);
	if (
		!operation.force &&
		document.lastDiskMtime !== undefined &&
		current.mtimeMs !== document.lastDiskMtime
	)
		return {
			...context.base(),
			status: "conflict",
			code: "EDITOR_EXTERNAL_CHANGE",
			message: "The file changed on disk. Reload or overwrite it.",
			documentId: document.documentId,
			path: relative(root, path).split(sep).join("/"),
			textRevision: document.textRevision,
		} as unknown as EditorOperationResult;
	await writeFile(path, document.editor.getLines().join("\n"), "utf8");
	const saved = await stat(path);
	documents.markSaved(document.documentId, saved.mtimeMs);
	context.emit(true);
	return {
		...context.base(),
		status: "accepted",
		documentId: document.documentId,
		textRevision: document.textRevision,
	} as unknown as EditorOperationResult;
}
